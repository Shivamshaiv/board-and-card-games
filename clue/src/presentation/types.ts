export type PresentationQuality = "low" | "medium" | "high";

export type RoomId =
  | "star-observatory"
  | "map-archive"
  | "winter-glasshouse"
  | "portrait-salon"
  | "lantern-atrium"
  | "music-conservatory"
  | "trophy-hall"
  | "cedar-dining-room"
  | "copper-kitchen";

export type SuspectKind =
  | "amara-saye"
  | "elias-rook"
  | "celeste-maren"
  | "inez-calder"
  | "mateo-vale"
  | "jun-park";

export type WeaponKind =
  | "clockmakers-hammer"
  | "conservatory-shears"
  | "marble-raven"
  | "crystal-decanter"
  | "bell-pull-cord"
  | "telescope-counterweight";

export type ScenePoint = readonly [x: number, z: number];

export interface PresentationRoom {
  id: RoomId;
  name: string;
  position: ScenePoint;
  size: ScenePoint;
  accent: string;
  floor: string;
  doors: readonly ("north" | "east" | "south" | "west")[];
}

export interface PresentationTile {
  id: string;
  position: ScenePoint;
  kind: "corridor" | "doorway" | "room";
  roomId?: RoomId;
}

export interface ScenePiece {
  id: string;
  suspect: SuspectKind;
  /** An explicit position wins over tileId and roomId. */
  position?: ScenePoint;
  tileId?: string;
  roomId?: RoomId;
  active?: boolean;
  selected?: boolean;
  eliminated?: boolean;
}

export interface SceneWeapon {
  id: string;
  weapon: WeaponKind;
  /** An explicit position wins over tileId and roomId. */
  position?: ScenePoint;
  tileId?: string;
  roomId?: RoomId;
  selected?: boolean;
}

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;

export interface DiceVisualState {
  /** Change this key for every new roll, even if the values repeat. */
  rollKey: string | number;
  values: readonly [DieValue, DieValue];
  rolling: boolean;
  durationMs?: number;
}

export type CameraPreset =
  | "overview"
  | "movement"
  | "room"
  | "card-reveal"
  | "case-file";

export interface SceneCameraState {
  preset: CameraPreset;
  /** Used by room/movement presets; explicit target wins over roomId. */
  target?: ScenePoint;
  roomId?: RoomId;
  /** Increment to replay the same camera move. */
  revision?: number;
}

export interface MansionSceneCallbacks {
  onRoomSelect?: (roomId: RoomId) => void;
  onRoomHover?: (roomId: RoomId | null) => void;
  onTileSelect?: (tileId: string) => void;
  onTileHover?: (tileId: string | null) => void;
  onPieceSelect?: (pieceId: string) => void;
  onWeaponSelect?: (weaponId: string) => void;
  onDiceSettled?: (rollKey: string | number) => void;
}

export interface MansionSceneProps extends MansionSceneCallbacks {
  rooms?: readonly PresentationRoom[];
  tiles?: readonly PresentationTile[];
  pieces?: readonly ScenePiece[];
  weapons?: readonly SceneWeapon[];
  reachableTileIds?: readonly string[];
  pathTileIds?: readonly string[];
  occupiedTileIds?: readonly string[];
  selectedTileId?: string | null;
  activeRoomId?: RoomId | null;
  camera?: SceneCameraState;
  dice?: DiceVisualState | null;
  quality?: PresentationQuality;
  reducedMotion?: boolean;
  showRoomLabels?: boolean;
  enableCameraInput?: boolean;
}
