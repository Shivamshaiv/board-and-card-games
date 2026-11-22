export type PlayerId = string;
export type CardId = string;
export type SuspectId = string;
export type WeaponId = string;
export type RoomId = string;
export type TileId = string;

export type PlayerKind = "human" | "ai";
export type CardKind = "suspect" | "weapon" | "room";

export interface SuspectCard {
  id: CardId;
  kind: "suspect";
  suspectId: SuspectId;
  name: string;
  title: string;
  color: string;
}

export interface WeaponCard {
  id: CardId;
  kind: "weapon";
  weaponId: WeaponId;
  name: string;
  description: string;
}

export interface RoomCard {
  id: CardId;
  kind: "room";
  roomId: RoomId;
  name: string;
  description: string;
}

export type GameCard = SuspectCard | WeaponCard | RoomCard;

export interface PlayerConfig {
  id: PlayerId;
  name: string;
  suspectId: SuspectId;
  kind: PlayerKind;
}

export interface GameConfig {
  seed: string | number;
  players: readonly PlayerConfig[];
  startingPlayerId?: PlayerId;
}

export interface Solution {
  suspectId: SuspectId;
  weaponId: WeaponId;
  roomId: RoomId;
}

export type GameStatus = "playing" | "won" | "all-eliminated";

export type TurnPhase =
  | "awaiting-action"
  | "awaiting-move"
  | "awaiting-suggestion"
  | "awaiting-reveal"
  | "awaiting-turn-end"
  | "ended";

export interface DiceRoll {
  dice: readonly [number, number];
  total: number;
}

export interface ReachableDestination {
  tileId: TileId;
  cost: number;
  path: readonly TileId[];
}

export interface Suggestion {
  suggestorId: PlayerId;
  suspectId: SuspectId;
  weaponId: WeaponId;
  roomId: RoomId;
}

export interface PendingSuggestion extends Suggestion {
  responderId: PlayerId;
  matchingCardIds: CardId[];
}

export interface PrivateRevealRecord {
  cardId: CardId;
  fromPlayerId: PlayerId;
  suggestion: Suggestion;
}

export interface InternalPlayerState extends PlayerConfig {
  hand: CardId[];
  eliminated: boolean;
  canSuggestInPlace: boolean;
}

export interface TurnState {
  number: number;
  activePlayerId: PlayerId;
  phase: TurnPhase;
  accusationWindowOpen: boolean;
  roll?: DiceRoll;
  reachable: ReachableDestination[];
  pendingSuggestion?: PendingSuggestion;
}

export type GameEventAudience =
  | { kind: "public" }
  | { kind: "private"; playerIds: PlayerId[] };

export type GameEventType =
  | "GAME_STARTED"
  | "TURN_STARTED"
  | "DICE_ROLLED"
  | "TOKEN_MOVED"
  | "ROOM_ENTERED"
  | "SECRET_PASSAGE_USED"
  | "SUGGESTION_DECLINED"
  | "SUGGESTION_MADE"
  | "PLAYER_PASSED"
  | "DISPROOF_REQUESTED"
  | "NO_ONE_DISPROVED"
  | "SUGGESTION_DISPROVED"
  | "CARD_REVEALED"
  | "ACCUSATION_MADE"
  | "PLAYER_ELIMINATED"
  | "TOKEN_RETIRED"
  | "GAME_ENDED";

export interface StoredGameEvent {
  sequence: number;
  type: GameEventType;
  audience: GameEventAudience;
  payload: Record<string, unknown>;
}

export interface VisibleGameEvent {
  sequence: number;
  type: GameEventType;
  payload: Record<string, unknown>;
}

/** Public plan vocabulary retained for integration consumers. */
export type DomainEvent = StoredGameEvent;

export interface AuthoritativeGameState {
  version: 1;
  revision: number;
  seed: string;
  rngState: number;
  status: GameStatus;
  winnerId?: PlayerId;
  caseFile: Solution;
  players: InternalPlayerState[];
  turn: TurnState;
  suspectLocations: Record<SuspectId, TileId | null>;
  weaponLocations: Record<WeaponId, RoomId>;
  privateReveals: Record<PlayerId, PrivateRevealRecord[]>;
  events: StoredGameEvent[];
  eventSequence: number;
}

type GameCommandIntent =
  | { type: "ROLL_DICE"; playerId: PlayerId }
  | { type: "MOVE_PLAYER"; playerId: PlayerId; destinationId: TileId }
  | { type: "USE_SECRET_PASSAGE"; playerId: PlayerId }
  | {
      type: "MAKE_SUGGESTION";
      playerId: PlayerId;
      suspectId: SuspectId;
      weaponId: WeaponId;
    }
  | { type: "CHOOSE_REVEAL"; playerId: PlayerId; cardId: CardId }
  | { type: "DECLINE_SUGGESTION"; playerId: PlayerId }
  | {
      type: "MAKE_ACCUSATION";
      playerId: PlayerId;
      suspectId: SuspectId;
      weaponId: WeaponId;
      roomId: RoomId;
    }
  | { type: "END_TURN"; playerId: PlayerId };

export type GameCommand = GameCommandIntent & {
  /** Optimistic concurrency guard. A stale command must have no side effects. */
  readonly expectedRevision?: number;
};

export type LegalActionType = GameCommand["type"];

export interface PublicPlayerView {
  id: PlayerId;
  name: string;
  suspectId: SuspectId;
  kind: PlayerKind;
  handSize: number;
  eliminated: boolean;
}

export interface PublicSuggestionView extends Suggestion {
  responderId?: PlayerId;
}

export interface PlayerGameView {
  revision: number;
  /** Opaque per-player decision stream seed; never the authoritative rules seed. */
  seed: string;
  viewerId: PlayerId;
  status: GameStatus;
  winnerId?: PlayerId;
  caseFile?: Solution;
  players: PublicPlayerView[];
  activePlayerId: PlayerId;
  turnNumber: number;
  phase: TurnPhase;
  roll?: DiceRoll;
  suspectLocations: Record<SuspectId, TileId | null>;
  weaponLocations: Record<WeaponId, RoomId>;
  ownHand: CardId[];
  privateReveals: PrivateRevealRecord[];
  pendingSuggestion?: PublicSuggestionView;
  legalActions: LegalActionType[];
  reachableDestinations: ReachableDestination[];
  revealChoices: CardId[];
}

export type HumanGameView = PlayerGameView;

export class RuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RuleError";
  }
}
