import { ROOM_IDS, SUSPECT_IDS } from "./content";
import type {
  ReachableDestination,
  RoomId,
  SuspectId,
  TileId,
} from "./types";

export interface BoardTile {
  id: TileId;
  kind: "corridor" | "room";
  x: number;
  z: number;
  walkable: true;
  neighbors: readonly TileId[];
  roomId?: RoomId;
  doorwayFor: readonly RoomId[];
  secretPassageTo?: RoomId;
}

export interface BoardDefinition {
  width: number;
  height: number;
  tiles: Readonly<Record<TileId, BoardTile>>;
  roomTiles: Readonly<Record<RoomId, TileId>>;
  startTiles: Readonly<Record<SuspectId, TileId>>;
  secretPassages: Readonly<Partial<Record<RoomId, RoomId>>>;
}

const SIZE = 25;
const tileId = (x: number, z: number): TileId => `tile-${x}-${z}`;

const roomAnchors: ReadonlyArray<readonly [number, number, RoomId]> = [
  [4, 4, ROOM_IDS[0]],
  [12, 4, ROOM_IDS[1]],
  [20, 4, ROOM_IDS[2]],
  [4, 12, ROOM_IDS[3]],
  [12, 12, ROOM_IDS[4]],
  [20, 12, ROOM_IDS[5]],
  [4, 20, ROOM_IDS[6]],
  [12, 20, ROOM_IDS[7]],
  [20, 20, ROOM_IDS[8]],
];

const roomAtCoordinate = new Map(
  roomAnchors.map(([x, z, roomId]) => [`${x}:${z}`, roomId]),
);

const secretPassages: Partial<Record<RoomId, RoomId>> = {
  [ROOM_IDS[0]]: ROOM_IDS[8],
  [ROOM_IDS[8]]: ROOM_IDS[0],
  [ROOM_IDS[2]]: ROOM_IDS[6],
  [ROOM_IDS[6]]: ROOM_IDS[2],
};

function createBoard(): BoardDefinition {
  const mutableTiles: Record<TileId, BoardTile> = {};
  const roomTiles = {} as Record<RoomId, TileId>;

  for (let z = 0; z < SIZE; z += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const id = tileId(x, z);
      const roomId = roomAtCoordinate.get(`${x}:${z}`);
      if (roomId) roomTiles[roomId] = id;
      mutableTiles[id] = {
        id,
        kind: roomId ? "room" : "corridor",
        x,
        z,
        walkable: true,
        neighbors: [],
        roomId,
        doorwayFor: [],
        secretPassageTo: roomId ? secretPassages[roomId] : undefined,
      };
    }
  }

  for (const tile of Object.values(mutableTiles)) {
    const neighbors = [
      [tile.x - 1, tile.z],
      [tile.x + 1, tile.z],
      [tile.x, tile.z - 1],
      [tile.x, tile.z + 1],
    ]
      .filter(([x, z]) => x >= 0 && z >= 0 && x < SIZE && z < SIZE)
      .map(([x, z]) => tileId(x, z))
      .sort();
    const doorwayFor = neighbors
      .map((neighborId) => mutableTiles[neighborId].roomId)
      .filter((roomId): roomId is RoomId => Boolean(roomId));
    mutableTiles[tile.id] = { ...tile, neighbors, doorwayFor };
  }

  const startCoordinates: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [12, 0],
    [24, 0],
    [0, 24],
    [12, 24],
    [24, 24],
  ];
  const startTiles = Object.fromEntries(
    SUSPECT_IDS.map((suspectId, index) => [
      suspectId,
      tileId(...startCoordinates[index]),
    ]),
  ) as Record<SuspectId, TileId>;

  return {
    width: SIZE,
    height: SIZE,
    tiles: mutableTiles,
    roomTiles,
    startTiles,
    secretPassages,
  };
}

export const MANSION_BOARD = createBoard();

export function roomAtTile(
  tileIdValue: TileId | null,
  board: BoardDefinition = MANSION_BOARD,
): RoomId | undefined {
  if (!tileIdValue) return undefined;
  return board.tiles[tileIdValue]?.roomId;
}

/**
 * Computes canonical shortest paths to every destination costing 1..maxSteps.
 * Rooms are terminal destinations (except the source room), corridor occupancy is
 * exclusive, and a player cannot leave and re-enter their source room in one move.
 */
export function reachableDestinations(
  from: TileId,
  maxSteps: number,
  occupiedCorridors: ReadonlySet<TileId>,
  board: BoardDefinition = MANSION_BOARD,
): ReachableDestination[] {
  if (!board.tiles[from] || maxSteps <= 0) return [];
  const sourceRoomId = board.tiles[from].roomId;
  const visited = new Set<TileId>([from]);
  const queue: Array<{ tileId: TileId; path: TileId[] }> = [
    { tileId: from, path: [from] },
  ];
  const result: ReachableDestination[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const cost = current.path.length - 1;
    const tile = board.tiles[current.tileId];

    if (cost > 0) {
      result.push({ tileId: tile.id, cost, path: current.path });
    }
    if (cost >= maxSteps || (cost > 0 && tile.kind === "room")) continue;

    for (const neighborId of tile.neighbors) {
      if (visited.has(neighborId)) continue;
      const neighbor = board.tiles[neighborId];
      if (neighbor.roomId && neighbor.roomId === sourceRoomId) continue;
      if (neighbor.kind === "corridor" && occupiedCorridors.has(neighborId)) {
        continue;
      }
      visited.add(neighborId);
      queue.push({ tileId: neighborId, path: [...current.path, neighborId] });
    }
  }

  return result.sort((left, right) =>
    left.cost === right.cost
      ? left.tileId.localeCompare(right.tileId)
      : left.cost - right.cost,
  );
}
