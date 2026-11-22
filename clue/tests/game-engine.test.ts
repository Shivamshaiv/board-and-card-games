import { describe, expect, it } from "vitest";
import {
  CARDS,
  MANSION_BOARD,
  ROOM_IDS,
  SUSPECT_IDS,
  WEAPON_IDS,
  RuleError,
  createGameSession,
  reachableDestinations,
  restoreGameSession,
  roomCardId,
  suspectCardId,
  weaponCardId,
  type AuthoritativeGameState,
  type GameConfig,
  type GameSession,
  type RoomId,
  type SuspectId,
} from "../src/game";

const basePlayers = [
  { id: "human", name: "Morgan", suspectId: "amara-saye", kind: "human" },
  { id: "ai-1", name: "Rook", suspectId: "elias-rook", kind: "ai" },
  { id: "ai-2", name: "Maren", suspectId: "celeste-maren", kind: "ai" },
  { id: "ai-3", name: "Calder", suspectId: "inez-calder", kind: "ai" },
  { id: "ai-4", name: "Vale", suspectId: "mateo-vale", kind: "ai" },
  { id: "ai-5", name: "Park", suspectId: "jun-park", kind: "ai" },
] as const;

function config(playerCount = 3, seed: string | number = "vesper-house"): GameConfig {
  return {
    seed,
    players: basePlayers.slice(0, playerCount),
    startingPlayerId: "human",
  };
}

function mutateState(
  session: GameSession,
  mutation: (state: AuthoritativeGameState) => void,
): GameSession {
  const state = session.exportState();
  mutation(state);
  return restoreGameSession(state);
}

function prepareSuggestion(
  session = createGameSession(config()),
  roomId: RoomId = "star-observatory",
): GameSession {
  return mutateState(session, (state) => {
    state.turn.activePlayerId = "human";
    state.turn.phase = "awaiting-suggestion";
    state.turn.accusationWindowOpen = false;
    state.turn.reachable = [];
    state.turn.pendingSuggestion = undefined;
    state.suspectLocations["amara-saye"] = MANSION_BOARD.roomTiles[roomId];
  });
}

function wrongSolutionFor(state: AuthoritativeGameState) {
  return {
    suspectId: SUSPECT_IDS.find((id) => id !== state.caseFile.suspectId) as SuspectId,
    weaponId: state.caseFile.weaponId,
    roomId: state.caseFile.roomId,
  };
}

describe("locked content and board topology", () => {
  it("defines the exact original 21-card registry", () => {
    expect(SUSPECT_IDS).toEqual([
      "amara-saye",
      "elias-rook",
      "celeste-maren",
      "inez-calder",
      "mateo-vale",
      "jun-park",
    ]);
    expect(WEAPON_IDS).toEqual([
      "clockmakers-hammer",
      "conservatory-shears",
      "marble-raven",
      "crystal-decanter",
      "bell-pull-cord",
      "telescope-counterweight",
    ]);
    expect(ROOM_IDS).toEqual([
      "star-observatory",
      "map-archive",
      "winter-glasshouse",
      "portrait-salon",
      "lantern-atrium",
      "music-conservatory",
      "trophy-hall",
      "cedar-dining-room",
      "copper-kitchen",
    ]);
    expect(CARDS).toHaveLength(21);
    expect(new Set(CARDS.map((card) => card.id))).toHaveLength(21);
  });

  it("builds a symmetric 25x25 graph with a 3x3 room layout", () => {
    expect(MANSION_BOARD.width).toBe(25);
    expect(MANSION_BOARD.height).toBe(25);
    expect(Object.keys(MANSION_BOARD.tiles)).toHaveLength(625);
    expect(Object.keys(MANSION_BOARD.roomTiles)).toHaveLength(9);
    expect(MANSION_BOARD.roomTiles).toMatchObject({
      "star-observatory": "tile-4-4",
      "map-archive": "tile-12-4",
      "winter-glasshouse": "tile-20-4",
      "portrait-salon": "tile-4-12",
      "lantern-atrium": "tile-12-12",
      "music-conservatory": "tile-20-12",
      "trophy-hall": "tile-4-20",
      "cedar-dining-room": "tile-12-20",
      "copper-kitchen": "tile-20-20",
    });
    for (const tile of Object.values(MANSION_BOARD.tiles)) {
      for (const neighborId of tile.neighbors) {
        expect(MANSION_BOARD.tiles[neighborId].neighbors).toContain(tile.id);
      }
    }
    for (const startId of Object.values(MANSION_BOARD.startTiles)) {
      const tile = MANSION_BOARD.tiles[startId];
      expect(tile.kind).toBe("corridor");
      expect(
        tile.x === 0 || tile.z === 0 || tile.x === 24 || tile.z === 24,
      ).toBe(true);
    }
  });

  it("pairs the two corner secret passages bidirectionally", () => {
    expect(MANSION_BOARD.secretPassages["star-observatory"]).toBe("copper-kitchen");
    expect(MANSION_BOARD.secretPassages["copper-kitchen"]).toBe("star-observatory");
    expect(MANSION_BOARD.secretPassages["winter-glasshouse"]).toBe("trophy-hall");
    expect(MANSION_BOARD.secretPassages["trophy-hall"]).toBe("winter-glasshouse");
  });
});

describe("deterministic setup and authoritative state", () => {
  it.each([3, 4, 5, 6])(
    "creates a valid, nearly even deal for %i players",
    (playerCount) => {
      const state = createGameSession(config(playerCount, `deal-${playerCount}`)).exportState();
      const handCards = state.players.flatMap((player) => player.hand);
      const solutionCards = [
        suspectCardId(state.caseFile.suspectId),
        weaponCardId(state.caseFile.weaponId),
        roomCardId(state.caseFile.roomId),
      ];
      const handSizes = state.players.map((player) => player.hand.length);

      expect(handCards).toHaveLength(18);
      expect(new Set([...handCards, ...solutionCards])).toHaveLength(21);
      expect(Math.max(...handSizes) - Math.min(...handSizes)).toBeLessThanOrEqual(1);
      expect(state.players.every((player) => player.hand.every((id) => !solutionCards.includes(id)))).toBe(true);
    },
  );

  it("reproduces setup, rolls, and event order from the same seed", () => {
    const left = createGameSession(config(3, "same-seed"));
    const right = createGameSession(config(3, "same-seed"));
    expect(left.exportState()).toEqual(right.exportState());

    left.dispatch({ type: "ROLL_DICE", playerId: "human" });
    right.dispatch({ type: "ROLL_DICE", playerId: "human" });
    expect(left.exportState()).toEqual(right.exportState());
  });

  it("restores a snapshot without sharing mutable references", () => {
    const original = createGameSession(config(3, "restore"));
    const restored = restoreGameSession(original.exportState());
    restored.dispatch({ type: "ROLL_DICE", playerId: "human" });
    expect(original.viewFor("human").phase).toBe("awaiting-action");
    expect(restored.viewFor("human").phase).toBe("awaiting-move");
  });

  it("rejects invalid commands without changing state", () => {
    const session = createGameSession(config());
    const before = session.exportState();
    expect(() => session.dispatch({ type: "ROLL_DICE", playerId: "ai-1" })).toThrow(
      RuleError,
    );
    expect(session.exportState()).toEqual(before);
  });

  it("rejects stale optimistic commands without advancing RNG or revision", () => {
    const session = createGameSession(config(3, "stale-command"));
    const before = session.exportState();
    expect(() => session.dispatch({
      type: "ROLL_DICE",
      playerId: "human",
      expectedRevision: before.revision + 1,
    })).toThrowError(/Expected revision/);
    expect(session.exportState()).toEqual(before);
  });
});

describe("movement and turn phases", () => {
  it("rolls two d6 and returns deterministic legal paths up to the total", () => {
    const session = createGameSession(config(3, "movement"));
    session.dispatch({ type: "ROLL_DICE", playerId: "human" });
    const view = session.viewFor("human");
    expect(view.roll?.dice).toHaveLength(2);
    expect(view.roll?.dice.every((die) => die >= 1 && die <= 6)).toBe(true);
    expect(view.reachableDestinations.length).toBeGreaterThan(0);
    expect(
      view.reachableDestinations.every(
        (destination) => destination.cost >= 1 && destination.cost <= (view.roll?.total ?? 0),
      ),
    ).toBe(true);
  });

  it("never routes through an occupied corridor or through a room", () => {
    const occupied = new Set(["tile-1-0"]);
    const destinations = reachableDestinations("tile-0-0", 12, occupied);
    expect(destinations.every((destination) => !destination.path.includes("tile-1-0"))).toBe(true);
    for (const destination of destinations) {
      const intermediate = destination.path.slice(1, -1);
      expect(intermediate.every((id) => MANSION_BOARD.tiles[id].kind === "corridor")).toBe(true);
    }
  });

  it("uses a stable canonical path for equal inputs", () => {
    expect(reachableDestinations("tile-0-0", 12, new Set())).toEqual(
      reachableDestinations("tile-0-0", 12, new Set()),
    );
  });

  it("moves through a corner passage instead of rolling and opens suggestion choice", () => {
    let session = createGameSession(config());
    session = mutateState(session, (state) => {
      state.suspectLocations["amara-saye"] = MANSION_BOARD.roomTiles["star-observatory"];
    });
    session.dispatch({ type: "USE_SECRET_PASSAGE", playerId: "human" });
    const view = session.viewFor("human");
    expect(view.suspectLocations["amara-saye"]).toBe(
      MANSION_BOARD.roomTiles["copper-kitchen"],
    );
    expect(view.phase).toBe("awaiting-suggestion");
  });

  it("does not allow an accusation after rolling, moving, or declining a suggestion", () => {
    let session = createGameSession(config(3, "accusation-window"));
    session.dispatch({ type: "ROLL_DICE", playerId: "human" });
    expect(session.viewFor("human").legalActions).not.toContain("MAKE_ACCUSATION");
    const accusation = wrongSolutionFor(session.exportState());
    expect(() =>
      session.dispatch({ type: "MAKE_ACCUSATION", playerId: "human", ...accusation }),
    ).toThrowError(/only legal before the primary action/i);

    const corridor = session
      .viewFor("human")
      .reachableDestinations.find(
        (destination) => MANSION_BOARD.tiles[destination.tileId].kind === "corridor",
      );
    expect(corridor).toBeDefined();
    session.dispatch({
      type: "MOVE_PLAYER",
      playerId: "human",
      destinationId: corridor!.tileId,
    });
    expect(session.viewFor("human").legalActions).not.toContain("MAKE_ACCUSATION");

    session = prepareSuggestion(createGameSession(config()));
    session.dispatch({ type: "DECLINE_SUGGESTION", playerId: "human" });
    expect(session.viewFor("human").legalActions).toEqual(["END_TURN"]);
  });
});

describe("suggestions and private disproval", () => {
  it("allows a player who starts the turn in a room to suggest instead of moving", () => {
    let session = createGameSession(config());
    session = mutateState(session, (state) => {
      state.turn.activePlayerId = "human";
      state.turn.phase = "awaiting-action";
      state.turn.accusationWindowOpen = false;
      state.players[0].canSuggestInPlace = false;
      state.suspectLocations["amara-saye"] =
        MANSION_BOARD.roomTiles["map-archive"];
    });

    expect(session.viewFor("human").legalActions).toContain("MAKE_SUGGESTION");
    expect(() =>
      session.dispatch({
        type: "MAKE_SUGGESTION",
        playerId: "human",
        suspectId: "elias-rook",
        weaponId: "crystal-decanter",
      }),
    ).not.toThrow();
  });

  it("stops at the first clockwise responder and exposes choices only to them", () => {
    let session = prepareSuggestion();
    session = mutateState(session, (state) => {
      state.players[0].hand = [];
      state.players[1].hand = [
        suspectCardId("amara-saye"),
        weaponCardId("clockmakers-hammer"),
      ];
      state.players[2].hand = [roomCardId("star-observatory")];
    });
    const before = session.exportState().eventSequence;
    session.dispatch({
      type: "MAKE_SUGGESTION",
      playerId: "human",
      suspectId: "amara-saye",
      weaponId: "clockmakers-hammer",
    });

    expect(session.viewFor("ai-1").revealChoices).toEqual([
      suspectCardId("amara-saye"),
      weaponCardId("clockmakers-hammer"),
    ]);
    expect(session.viewFor("ai-2").revealChoices).toEqual([]);
    expect(session.eventsFor("ai-1", before).some((event) => event.type === "DISPROOF_REQUESTED")).toBe(true);
    expect(session.eventsFor("ai-2", before).some((event) => event.type === "DISPROOF_REQUESTED")).toBe(false);
  });

  it("records only queried passes and reveals exactly one card privately", () => {
    let session = prepareSuggestion();
    session = mutateState(session, (state) => {
      state.players[0].hand = [];
      state.players[1].hand = [];
      state.players[2].hand = [roomCardId("star-observatory")];
    });
    const before = session.exportState().eventSequence;
    session.dispatch({
      type: "MAKE_SUGGESTION",
      playerId: "human",
      suspectId: "amara-saye",
      weaponId: "clockmakers-hammer",
    });
    const publicPasses = session
      .eventsFor("human", before)
      .filter((event) => event.type === "PLAYER_PASSED");
    expect(publicPasses).toHaveLength(1);
    expect(publicPasses[0].payload.playerId).toBe("ai-1");

    const revealStart = session.exportState().eventSequence;
    session.dispatch({
      type: "CHOOSE_REVEAL",
      playerId: "ai-2",
      cardId: roomCardId("star-observatory"),
    });
    const humanEvents = session.eventsFor("human", revealStart);
    const uninvolvedEvents = session.eventsFor("ai-1", revealStart);
    expect(humanEvents.find((event) => event.type === "CARD_REVEALED")?.payload.cardId).toBe(
      roomCardId("star-observatory"),
    );
    expect(uninvolvedEvents.some((event) => event.type === "CARD_REVEALED")).toBe(false);
    expect(uninvolvedEvents.find((event) => event.type === "SUGGESTION_DISPROVED")?.payload).not.toHaveProperty("cardId");
    expect(session.viewFor("human").privateReveals).toHaveLength(1);
    expect(session.viewFor("ai-1").privateReveals).toHaveLength(0);
    expect(session.viewFor("human").legalActions).toContain("MAKE_ACCUSATION");
  });

  it("includes eliminated players in clockwise disproval", () => {
    let session = prepareSuggestion();
    session = mutateState(session, (state) => {
      state.players[1].eliminated = true;
      state.players[1].hand = [weaponCardId("clockmakers-hammer")];
      state.players[2].hand = [];
    });
    session.dispatch({
      type: "MAKE_SUGGESTION",
      playerId: "human",
      suspectId: "amara-saye",
      weaponId: "clockmakers-hammer",
    });
    expect(session.viewFor("ai-1").legalActions).toEqual(["CHOOSE_REVEAL"]);
  });

  it("relocates the named pieces and grants the moved suspect an in-place suggestion", () => {
    let session = prepareSuggestion();
    session = mutateState(session, (state) => {
      state.players[1].hand = [];
      state.players[2].hand = [];
    });
    session.dispatch({
      type: "MAKE_SUGGESTION",
      playerId: "human",
      suspectId: "elias-rook",
      weaponId: "clockmakers-hammer",
    });
    expect(session.viewFor("human").suspectLocations["elias-rook"]).toBe(
      MANSION_BOARD.roomTiles["star-observatory"],
    );
    expect(session.viewFor("human").weaponLocations["clockmakers-hammer"]).toBe(
      "star-observatory",
    );
    session.dispatch({ type: "END_TURN", playerId: "human" });
    expect(session.viewFor("ai-1").legalActions).toContain("MAKE_SUGGESTION");
  });
});

describe("accusations, elimination, and projections", () => {
  it("wins immediately on a correct accusation and reveals the Case File", () => {
    const session = createGameSession(config(3, "winner"));
    const solution = session.exportState().caseFile;
    session.dispatch({ type: "MAKE_ACCUSATION", playerId: "human", ...solution });
    const view = session.viewFor("human");
    expect(view.status).toBe("won");
    expect(view.winnerId).toBe("human");
    expect(view.caseFile).toEqual(solution);
    expect(view.phase).toBe("ended");
  });

  it("eliminates an incorrect accuser without revealing the solution", () => {
    const session = createGameSession(config(3, "wrong"));
    const wrong = wrongSolutionFor(session.exportState());
    session.dispatch({ type: "MAKE_ACCUSATION", playerId: "human", ...wrong });
    const humanView = session.viewFor("human");
    const aiView = session.viewFor("ai-1");
    expect(humanView.status).toBe("playing");
    expect(humanView.caseFile).toBeUndefined();
    expect(aiView.caseFile).toBeUndefined();
    expect(humanView.players.find((player) => player.id === "human")?.eliminated).toBe(true);
    expect(aiView.activePlayerId).toBe("ai-1");
    expect(
      session.eventsFor("ai-1").find((event) => event.type === "PLAYER_ELIMINATED"),
    ).toBeDefined();
    expect(session.eventsFor("ai-1").some((event) => event.type === "GAME_ENDED")).toBe(false);
  });

  it("does not auto-win the final active player and ends only after all accuse incorrectly", () => {
    const session = createGameSession(config(3, "all-wrong"));
    const wrong = wrongSolutionFor(session.exportState());
    session.dispatch({ type: "MAKE_ACCUSATION", playerId: "human", ...wrong });
    session.dispatch({ type: "MAKE_ACCUSATION", playerId: "ai-1", ...wrong });
    expect(session.viewFor("ai-2").status).toBe("playing");
    expect(session.viewFor("ai-2").activePlayerId).toBe("ai-2");
    expect(session.viewFor("ai-2").caseFile).toBeUndefined();

    session.dispatch({ type: "MAKE_ACCUSATION", playerId: "ai-2", ...wrong });
    const finalView = session.viewFor("human");
    expect(finalView.status).toBe("all-eliminated");
    expect(finalView.caseFile).toEqual(session.exportState().caseFile);
  });

  it("keeps other hands, pending reveal choices, and the Case File out of player projections", () => {
    const session = createGameSession(config(3, "privacy"));
    const internal = session.exportState();
    const view = session.viewFor("human");
    expect(view.caseFile).toBeUndefined();
    expect(view.ownHand).toEqual(internal.players[0].hand);
    expect(view.players.every((player) => !("hand" in player))).toBe(true);
    expect(view.revealChoices).toEqual([]);
    expect(JSON.stringify(view)).not.toContain('"caseFile"');
  });

  it("never exposes the authoritative rules seed through views or public events", () => {
    const session = createGameSession(config(3, "sealed-rules-seed"));
    const authoritativeSeed = session.exportState().seed;
    const humanView = session.viewFor("human");
    const aiView = session.viewFor("ai-1");

    expect(humanView.seed).not.toBe(authoritativeSeed);
    expect(aiView.seed).not.toBe(authoritativeSeed);
    expect(aiView.seed).not.toBe(humanView.seed);
    expect(JSON.stringify(session.eventsFor("human"))).not.toContain(authoritativeSeed);
  });

  it("scrubs a legacy public seed when restoring an older save", () => {
    const original = createGameSession(config(3, "legacy-public-seed"));
    const snapshot = original.exportState();
    const started = snapshot.events.find((event) => event.type === "GAME_STARTED");
    expect(started).toBeDefined();
    started!.payload.seed = snapshot.seed;

    const restored = restoreGameSession(snapshot);
    expect(JSON.stringify(restored.eventsFor("human"))).not.toContain(snapshot.seed);
    expect(restored.exportState().seed).toBe(snapshot.seed);
  });
});
