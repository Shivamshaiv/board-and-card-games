import {
  CARDS,
  ROOM_IDS,
  ROOMS,
  SUSPECT_IDS,
  SUSPECTS,
  WEAPON_IDS,
  WEAPONS,
  isRoomId,
  isSuspectId,
  isWeaponId,
  roomCardId,
  suspectCardId,
  weaponCardId,
} from "./content";
import {
  MANSION_BOARD,
  reachableDestinations,
  roomAtTile,
} from "./board";
import { SeededRandom, deriveStreamSeed } from "./rng";
import type {
  AuthoritativeGameState,
  CardId,
  GameCommand,
  GameConfig,
  GameEventAudience,
  GameEventType,
  InternalPlayerState,
  LegalActionType,
  PlayerGameView,
  PlayerId,
  PrivateRevealRecord,
  RoomId,
  Solution,
  StoredGameEvent,
  Suggestion,
  SuspectId,
  TileId,
  VisibleGameEvent,
  WeaponId,
} from "./types";
import { RuleError } from "./types";

const PUBLIC: GameEventAudience = { kind: "public" };

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function assertRule(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new RuleError(code, message);
}

function validateConfig(config: GameConfig): void {
  assertRule(
    config.players.length >= 3 && config.players.length <= 6,
    "INVALID_PLAYER_COUNT",
    "A game requires between 3 and 6 players.",
  );
  assertRule(
    new Set(config.players.map((player) => player.id)).size === config.players.length,
    "DUPLICATE_PLAYER_ID",
    "Player IDs must be unique.",
  );
  assertRule(
    new Set(config.players.map((player) => player.suspectId)).size ===
      config.players.length,
    "DUPLICATE_SUSPECT",
    "Each player must control a unique suspect.",
  );
  for (const player of config.players) {
    assertRule(player.id.length > 0, "INVALID_PLAYER_ID", "Player IDs cannot be empty.");
    assertRule(
      isSuspectId(player.suspectId),
      "UNKNOWN_SUSPECT",
      `Unknown suspect: ${player.suspectId}`,
    );
  }
  if (config.startingPlayerId) {
    assertRule(
      config.players.some((player) => player.id === config.startingPlayerId),
      "UNKNOWN_STARTING_PLAYER",
      "The configured starting player is not in the game.",
    );
  }
}

function createInitialState(config: GameConfig): AuthoritativeGameState {
  validateConfig(config);
  const seed = String(config.seed);
  const rng = new SeededRandom(seed);

  const suspectDeck = rng.shuffle(SUSPECTS);
  const weaponDeck = rng.shuffle(WEAPONS);
  const roomDeck = rng.shuffle(ROOMS);
  const caseFile: Solution = {
    suspectId: suspectDeck[0].suspectId,
    weaponId: weaponDeck[0].weaponId,
    roomId: roomDeck[0].roomId,
  };
  const dealDeck = rng.shuffle([
    ...suspectDeck.slice(1),
    ...weaponDeck.slice(1),
    ...roomDeck.slice(1),
  ]);
  const dealOffset = rng.int(config.players.length);

  const players: InternalPlayerState[] = config.players.map((player) => ({
    ...player,
    hand: [],
    eliminated: false,
    canSuggestInPlace: false,
  }));
  dealDeck.forEach((card, index) => {
    players[(dealOffset + index) % players.length].hand.push(card.id);
  });

  const startingPlayerId =
    config.startingPlayerId ?? players[rng.int(players.length)].id;
  const roomOrder = rng.shuffle(ROOM_IDS);
  const weaponLocations = Object.fromEntries(
    WEAPON_IDS.map((weaponId, index) => [weaponId, roomOrder[index]]),
  ) as Record<WeaponId, RoomId>;
  const participatingSuspects = new Set(players.map((player) => player.suspectId));
  const suspectLocations = Object.fromEntries(
    SUSPECT_IDS.map((suspectId) => [
      suspectId,
      participatingSuspects.has(suspectId)
        ? MANSION_BOARD.startTiles[suspectId]
        : null,
    ]),
  ) as Record<SuspectId, TileId | null>;
  const privateReveals = Object.fromEntries(
    players.map((player) => [player.id, []]),
  ) as Record<PlayerId, PrivateRevealRecord[]>;

  const state: AuthoritativeGameState = {
    version: 1,
    revision: 0,
    seed,
    rngState: rng.state,
    status: "playing",
    caseFile,
    players,
    turn: {
      number: 1,
      activePlayerId: startingPlayerId,
      phase: "awaiting-action",
      accusationWindowOpen: false,
      reachable: [],
    },
    suspectLocations,
    weaponLocations,
    privateReveals,
    events: [],
    eventSequence: 0,
  };
  appendEvent(state, "GAME_STARTED", PUBLIC, {
    startingPlayerId,
    players: players.map(({ id, name, suspectId, kind, hand }) => ({
      id,
      name,
      suspectId,
      kind,
      handSize: hand.length,
    })),
  });
  appendEvent(state, "TURN_STARTED", PUBLIC, {
    playerId: startingPlayerId,
    turnNumber: 1,
  });
  return state;
}

function appendEvent(
  state: AuthoritativeGameState,
  type: GameEventType,
  audience: GameEventAudience,
  payload: Record<string, unknown>,
): StoredGameEvent {
  const event: StoredGameEvent = {
    sequence: state.eventSequence + 1,
    type,
    audience,
    payload,
  };
  state.eventSequence = event.sequence;
  state.events.push(event);
  return event;
}

function playerById(state: AuthoritativeGameState, playerId: PlayerId) {
  const player = state.players.find((candidate) => candidate.id === playerId);
  assertRule(player, "UNKNOWN_PLAYER", `Unknown player: ${playerId}`);
  return player;
}

function activePlayer(state: AuthoritativeGameState, playerId: PlayerId) {
  const player = playerById(state, playerId);
  assertRule(
    state.turn.activePlayerId === playerId,
    "OUT_OF_TURN",
    "Only the active player may perform that action.",
  );
  assertRule(!player.eliminated, "PLAYER_ELIMINATED", "That player is eliminated.");
  return player;
}

function occupiedCorridors(
  state: AuthoritativeGameState,
  movingSuspectId: SuspectId,
): Set<TileId> {
  const occupied = new Set<TileId>();
  for (const [suspectId, location] of Object.entries(state.suspectLocations)) {
    if (!location || suspectId === movingSuspectId) continue;
    if (MANSION_BOARD.tiles[location].kind === "corridor") occupied.add(location);
  }
  return occupied;
}

function currentRoom(state: AuthoritativeGameState, suspectId: SuspectId): RoomId {
  const roomId = roomAtTile(state.suspectLocations[suspectId]);
  assertRule(roomId, "NOT_IN_ROOM", "The suspect is not currently in a room.");
  return roomId;
}

function validateSuggestionIds(suspectId: string, weaponId: string): void {
  assertRule(isSuspectId(suspectId), "UNKNOWN_SUSPECT", `Unknown suspect: ${suspectId}`);
  assertRule(isWeaponId(weaponId), "UNKNOWN_WEAPON", `Unknown weapon: ${weaponId}`);
}

function scanForDisproof(
  state: AuthoritativeGameState,
  suggestion: Suggestion,
): void {
  const suggestorIndex = state.players.findIndex(
    (player) => player.id === suggestion.suggestorId,
  );
  const matchingIds = new Set<CardId>([
    suspectCardId(suggestion.suspectId),
    weaponCardId(suggestion.weaponId),
    roomCardId(suggestion.roomId),
  ]);

  for (let offset = 1; offset < state.players.length; offset += 1) {
    const candidate = state.players[(suggestorIndex + offset) % state.players.length];
    const matchingCardIds = candidate.hand.filter((cardId) => matchingIds.has(cardId));
    if (matchingCardIds.length === 0) {
      appendEvent(state, "PLAYER_PASSED", PUBLIC, {
        playerId: candidate.id,
        suggestion,
      });
      continue;
    }
    state.turn.pendingSuggestion = {
      ...suggestion,
      responderId: candidate.id,
      matchingCardIds,
    };
    state.turn.phase = "awaiting-reveal";
    appendEvent(
      state,
      "DISPROOF_REQUESTED",
      { kind: "private", playerIds: [candidate.id] },
      { suggestion, matchingCardCount: matchingCardIds.length },
    );
    return;
  }

  state.turn.phase = "awaiting-turn-end";
  state.turn.accusationWindowOpen = true;
  state.turn.pendingSuggestion = undefined;
  appendEvent(state, "NO_ONE_DISPROVED", PUBLIC, { suggestion });
}

function advanceTurn(state: AuthoritativeGameState): void {
  const activeIndex = state.players.findIndex(
    (player) => player.id === state.turn.activePlayerId,
  );
  let nextPlayer: InternalPlayerState | undefined;
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = state.players[(activeIndex + offset) % state.players.length];
    if (!candidate.eliminated) {
      nextPlayer = candidate;
      break;
    }
  }
  assertRule(nextPlayer, "NO_ACTIVE_PLAYERS", "No accusation-eligible players remain.");
  state.turn = {
    number: state.turn.number + 1,
    activePlayerId: nextPlayer.id,
    phase: "awaiting-action",
    accusationWindowOpen: false,
    reachable: [],
  };
  appendEvent(state, "TURN_STARTED", PUBLIC, {
    playerId: nextPlayer.id,
    turnNumber: state.turn.number,
  });
}

function legalActionsFor(
  state: AuthoritativeGameState,
  viewerId: PlayerId,
): LegalActionType[] {
  if (state.status !== "playing") return [];
  const viewer = playerById(state, viewerId);
  const actions: LegalActionType[] = [];
  const isActive = state.turn.activePlayerId === viewerId && !viewer.eliminated;

  if (state.turn.phase === "awaiting-reveal") {
    if (state.turn.pendingSuggestion?.responderId === viewerId) {
      actions.push("CHOOSE_REVEAL");
    }
    return actions;
  }
  if (!isActive) return actions;

  if (state.turn.phase === "awaiting-action") {
    actions.push("ROLL_DICE", "MAKE_ACCUSATION");
    const roomId = roomAtTile(state.suspectLocations[viewer.suspectId]);
    if (roomId && MANSION_BOARD.secretPassages[roomId]) {
      actions.push("USE_SECRET_PASSAGE");
    }
    if (roomId) actions.push("MAKE_SUGGESTION");
  } else if (state.turn.phase === "awaiting-move") {
    actions.push("MOVE_PLAYER");
    if (state.turn.reachable.length === 0) actions.push("END_TURN");
  } else if (state.turn.phase === "awaiting-suggestion") {
    actions.push("MAKE_SUGGESTION", "DECLINE_SUGGESTION");
  } else if (state.turn.phase === "awaiting-turn-end") {
    if (state.turn.accusationWindowOpen) actions.push("MAKE_ACCUSATION");
    actions.push("END_TURN");
  }
  return actions;
}

export class GameSession {
  private constructor(private state: AuthoritativeGameState) {}

  static create(config: GameConfig): GameSession {
    return new GameSession(createInitialState(config));
  }

  static restore(snapshot: AuthoritativeGameState): GameSession {
    assertRule(snapshot.version === 1, "UNSUPPORTED_STATE_VERSION", "Unsupported state version.");
    assertRule(snapshot.players.length >= 3, "INVALID_SNAPSHOT", "Snapshot has too few players.");
    const restored = clone(snapshot);
    // Saves made before decision-stream separation included the authoritative
    // root seed in the public GAME_STARTED payload. Scrub it during migration
    // so resuming an older investigation cannot reveal the sealed deal.
    for (const event of restored.events) {
      if (event.type === "GAME_STARTED") delete event.payload.seed;
    }
    return new GameSession(restored);
  }

  dispatch(command: GameCommand): VisibleGameEvent[] {
    const startingSequence = this.state.eventSequence;
    assertRule(
      command.expectedRevision === undefined || command.expectedRevision === this.state.revision,
      "STALE_COMMAND",
      `Expected revision ${command.expectedRevision ?? "current"}, but the investigation is at revision ${this.state.revision}.`,
    );
    assertRule(this.state.status === "playing", "GAME_ENDED", "The game has ended.");
    playerById(this.state, command.playerId);

    switch (command.type) {
      case "ROLL_DICE":
        this.rollDice(command.playerId);
        break;
      case "MOVE_PLAYER":
        this.movePlayer(command.playerId, command.destinationId);
        break;
      case "USE_SECRET_PASSAGE":
        this.useSecretPassage(command.playerId);
        break;
      case "MAKE_SUGGESTION":
        this.makeSuggestion(command.playerId, command.suspectId, command.weaponId);
        break;
      case "CHOOSE_REVEAL":
        this.chooseReveal(command.playerId, command.cardId);
        break;
      case "DECLINE_SUGGESTION":
        this.declineSuggestion(command.playerId);
        break;
      case "MAKE_ACCUSATION":
        this.makeAccusation(
          command.playerId,
          command.suspectId,
          command.weaponId,
          command.roomId,
        );
        break;
      case "END_TURN":
        this.endTurn(command.playerId);
        break;
    }
    this.state.revision += 1;
    return this.eventsFor(command.playerId, startingSequence);
  }

  viewFor(playerId: PlayerId): PlayerGameView {
    const viewer = playerById(this.state, playerId);
    const pending = this.state.turn.pendingSuggestion;
    const revealChoices =
      pending?.responderId === playerId ? [...pending.matchingCardIds] : [];
    const revealPublic = pending
      ? {
          suggestorId: pending.suggestorId,
          suspectId: pending.suspectId,
          weaponId: pending.weaponId,
          roomId: pending.roomId,
          responderId: pending.responderId,
        }
      : undefined;

    return clone({
      revision: this.state.revision,
      seed: deriveStreamSeed(this.state.seed, `ai:${playerId}`),
      viewerId: playerId,
      status: this.state.status,
      winnerId: this.state.winnerId,
      caseFile: this.state.status === "playing" ? undefined : this.state.caseFile,
      players: this.state.players.map((player) => ({
        id: player.id,
        name: player.name,
        suspectId: player.suspectId,
        kind: player.kind,
        handSize: player.hand.length,
        eliminated: player.eliminated,
      })),
      activePlayerId: this.state.turn.activePlayerId,
      turnNumber: this.state.turn.number,
      phase: this.state.turn.phase,
      roll: this.state.turn.roll,
      suspectLocations: this.state.suspectLocations,
      weaponLocations: this.state.weaponLocations,
      ownHand: viewer.hand,
      privateReveals: this.state.privateReveals[playerId],
      pendingSuggestion: revealPublic,
      legalActions: legalActionsFor(this.state, playerId),
      reachableDestinations:
        this.state.turn.activePlayerId === playerId
          ? this.state.turn.reachable
          : [],
      revealChoices,
    });
  }

  eventsFor(playerId: PlayerId, afterSequence = 0): VisibleGameEvent[] {
    playerById(this.state, playerId);
    return this.state.events
      .filter(
        (event) =>
          event.sequence > afterSequence &&
          (event.audience.kind === "public" ||
            event.audience.playerIds.includes(playerId)),
      )
      .map(({ sequence, type, payload }) => clone({ sequence, type, payload }));
  }

  exportState(): AuthoritativeGameState {
    return clone(this.state);
  }

  private rollDice(playerId: PlayerId): void {
    const player = activePlayer(this.state, playerId);
    assertRule(
      this.state.turn.phase === "awaiting-action",
      "INVALID_PHASE",
      "Dice can only be rolled at the start of a turn.",
    );
    player.canSuggestInPlace = false;
    const rng = new SeededRandom(this.state.seed, this.state.rngState);
    const first = rng.int(6) + 1;
    const second = rng.int(6) + 1;
    this.state.rngState = rng.state;
    const roll = { dice: [first, second] as const, total: first + second };
    const from = this.state.suspectLocations[player.suspectId];
    assertRule(from, "TOKEN_OFF_BOARD", "The active suspect is not on the board.");
    this.state.turn.roll = roll;
    this.state.turn.accusationWindowOpen = false;
    this.state.turn.reachable = reachableDestinations(
      from,
      roll.total,
      occupiedCorridors(this.state, player.suspectId),
    );
    this.state.turn.phase = "awaiting-move";
    appendEvent(this.state, "DICE_ROLLED", PUBLIC, { playerId, ...roll });
  }

  private movePlayer(playerId: PlayerId, destinationId: TileId): void {
    const player = activePlayer(this.state, playerId);
    assertRule(
      this.state.turn.phase === "awaiting-move",
      "INVALID_PHASE",
      "Movement is only legal after rolling.",
    );
    const destination = this.state.turn.reachable.find(
      (candidate) => candidate.tileId === destinationId,
    );
    assertRule(destination, "ILLEGAL_DESTINATION", "That destination is not reachable.");
    const from = this.state.suspectLocations[player.suspectId];
    this.state.suspectLocations[player.suspectId] = destinationId;
    this.state.turn.reachable = [];
    appendEvent(this.state, "TOKEN_MOVED", PUBLIC, {
      playerId,
      suspectId: player.suspectId,
      from,
      to: destinationId,
      path: destination.path,
      cost: destination.cost,
    });
    const roomId = roomAtTile(destinationId);
    if (roomId) {
      this.state.turn.phase = "awaiting-suggestion";
      appendEvent(this.state, "ROOM_ENTERED", PUBLIC, { playerId, roomId });
    } else {
      this.state.turn.phase = "awaiting-turn-end";
      this.state.turn.accusationWindowOpen = false;
    }
  }

  private useSecretPassage(playerId: PlayerId): void {
    const player = activePlayer(this.state, playerId);
    assertRule(
      this.state.turn.phase === "awaiting-action",
      "INVALID_PHASE",
      "A secret passage can only be used at the start of a turn.",
    );
    const fromRoomId = currentRoom(this.state, player.suspectId);
    const toRoomId = MANSION_BOARD.secretPassages[fromRoomId];
    assertRule(toRoomId, "NO_SECRET_PASSAGE", "This room has no secret passage.");
    player.canSuggestInPlace = false;
    this.state.suspectLocations[player.suspectId] = MANSION_BOARD.roomTiles[toRoomId];
    this.state.turn.phase = "awaiting-suggestion";
    this.state.turn.accusationWindowOpen = false;
    appendEvent(this.state, "SECRET_PASSAGE_USED", PUBLIC, {
      playerId,
      suspectId: player.suspectId,
      fromRoomId,
      toRoomId,
    });
    appendEvent(this.state, "ROOM_ENTERED", PUBLIC, { playerId, roomId: toRoomId });
  }

  private makeSuggestion(
    playerId: PlayerId,
    suspectId: SuspectId,
    weaponId: WeaponId,
  ): void {
    const player = activePlayer(this.state, playerId);
    validateSuggestionIds(suspectId, weaponId);
    const enteredRoom = this.state.turn.phase === "awaiting-suggestion";
    const inPlace =
      this.state.turn.phase === "awaiting-action" &&
      Boolean(roomAtTile(this.state.suspectLocations[player.suspectId]));
    assertRule(
      enteredRoom || inPlace,
      "SUGGESTION_NOT_AVAILABLE",
      "A suggestion requires a fresh room entry or the player to start the turn in a room.",
    );
    const roomId = currentRoom(this.state, player.suspectId);
    player.canSuggestInPlace = false;
    const roomTile = MANSION_BOARD.roomTiles[roomId];
    const previousLocation = this.state.suspectLocations[suspectId];
    this.state.suspectLocations[suspectId] = roomTile;
    this.state.weaponLocations[weaponId] = roomId;
    const relocatedPlayer = this.state.players.find(
      (candidate) => candidate.suspectId === suspectId,
    );
    if (
      relocatedPlayer &&
      relocatedPlayer.id !== playerId &&
      previousLocation !== roomTile
    ) {
      relocatedPlayer.canSuggestInPlace = true;
    }
    const suggestion: Suggestion = {
      suggestorId: playerId,
      suspectId,
      weaponId,
      roomId,
    };
    appendEvent(this.state, "SUGGESTION_MADE", PUBLIC, {
      suggestion,
      suspectFrom: previousLocation,
    });
    scanForDisproof(this.state, suggestion);
  }

  private chooseReveal(playerId: PlayerId, cardId: CardId): void {
    const pending = this.state.turn.pendingSuggestion;
    assertRule(
      this.state.turn.phase === "awaiting-reveal" && pending,
      "NO_REVEAL_PENDING",
      "No disproval is awaiting a card.",
    );
    assertRule(
      pending.responderId === playerId,
      "NOT_RESPONDER",
      "Only the first eligible responder may reveal a card.",
    );
    assertRule(
      pending.matchingCardIds.includes(cardId),
      "INVALID_REVEAL",
      "The selected card does not disprove the suggestion.",
    );
    const suggestion: Suggestion = {
      suggestorId: pending.suggestorId,
      suspectId: pending.suspectId,
      weaponId: pending.weaponId,
      roomId: pending.roomId,
    };
    const reveal: PrivateRevealRecord = {
      cardId,
      fromPlayerId: playerId,
      suggestion,
    };
    this.state.privateReveals[pending.suggestorId].push(reveal);
    appendEvent(this.state, "SUGGESTION_DISPROVED", PUBLIC, {
      suggestion,
      responderId: playerId,
    });
    appendEvent(
      this.state,
      "CARD_REVEALED",
      { kind: "private", playerIds: [pending.suggestorId, playerId] },
      { suggestion, responderId: playerId, recipientId: pending.suggestorId, cardId },
    );
    this.state.turn.pendingSuggestion = undefined;
    this.state.turn.phase = "awaiting-turn-end";
    this.state.turn.accusationWindowOpen = true;
  }

  private declineSuggestion(playerId: PlayerId): void {
    activePlayer(this.state, playerId);
    assertRule(
      this.state.turn.phase === "awaiting-suggestion",
      "INVALID_PHASE",
      "There is no optional suggestion to decline.",
    );
    this.state.turn.phase = "awaiting-turn-end";
    this.state.turn.accusationWindowOpen = false;
    appendEvent(this.state, "SUGGESTION_DECLINED", PUBLIC, { playerId });
  }

  private makeAccusation(
    playerId: PlayerId,
    suspectId: SuspectId,
    weaponId: WeaponId,
    roomId: RoomId,
  ): void {
    const player = activePlayer(this.state, playerId);
    validateSuggestionIds(suspectId, weaponId);
    assertRule(isRoomId(roomId), "UNKNOWN_ROOM", `Unknown room: ${roomId}`);
    const accusationAllowed =
      this.state.turn.phase === "awaiting-action" ||
      (this.state.turn.phase === "awaiting-turn-end" &&
        this.state.turn.accusationWindowOpen);
    assertRule(
      accusationAllowed,
      "INVALID_PHASE",
      "An accusation is only legal before the primary action or after a resolved suggestion.",
    );
    const accusation = { suspectId, weaponId, roomId };
    appendEvent(this.state, "ACCUSATION_MADE", PUBLIC, { playerId, accusation });
    const correct =
      suspectId === this.state.caseFile.suspectId &&
      weaponId === this.state.caseFile.weaponId &&
      roomId === this.state.caseFile.roomId;
    if (correct) {
      this.state.status = "won";
      this.state.winnerId = playerId;
      this.state.turn.phase = "ended";
      appendEvent(this.state, "GAME_ENDED", PUBLIC, {
        outcome: "won",
        winnerId: playerId,
        caseFile: this.state.caseFile,
      });
      return;
    }

    player.eliminated = true;
    appendEvent(this.state, "PLAYER_ELIMINATED", PUBLIC, {
      playerId,
      reason: "incorrect-accusation",
    });
    const location = this.state.suspectLocations[player.suspectId];
    if (location && MANSION_BOARD.tiles[location].kind === "corridor") {
      this.state.suspectLocations[player.suspectId] = null;
      appendEvent(this.state, "TOKEN_RETIRED", PUBLIC, {
        playerId,
        suspectId: player.suspectId,
        from: location,
      });
    }

    if (this.state.players.every((candidate) => candidate.eliminated)) {
      this.state.status = "all-eliminated";
      this.state.turn.phase = "ended";
      appendEvent(this.state, "GAME_ENDED", PUBLIC, {
        outcome: "all-eliminated",
        caseFile: this.state.caseFile,
      });
      return;
    }
    advanceTurn(this.state);
  }

  private endTurn(playerId: PlayerId): void {
    activePlayer(this.state, playerId);
    const mayEnd =
      this.state.turn.phase === "awaiting-turn-end" ||
      (this.state.turn.phase === "awaiting-move" &&
        this.state.turn.reachable.length === 0);
    assertRule(mayEnd, "TURN_NOT_COMPLETE", "The active player still has an action to take.");
    advanceTurn(this.state);
  }
}

export const createGameSession = (config: GameConfig): GameSession =>
  GameSession.create(config);

export const restoreGameSession = (state: AuthoritativeGameState): GameSession =>
  GameSession.restore(state);

export function allCardIds(): CardId[] {
  return CARDS.map((card) => card.id);
}
