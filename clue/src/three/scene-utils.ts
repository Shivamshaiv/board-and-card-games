import * as THREE from "three";

import type {
  PresentationRoom,
  PresentationTile,
  RoomId,
  ScenePoint,
} from "../presentation";

export const BOARD_WIDTH = 22;
export const BOARD_DEPTH = 18;
export const BOARD_SURFACE_Y = 0.46;

export const tmpObject = new THREE.Object3D();

/**
 * Runtime scene data can cross a persistence/UI boundary despite the stricter
 * TypeScript tuple. Keep malformed coordinates out of Three's matrices: one
 * NaN is enough to poison culling and a geometry's computed bounds.
 */
export function isFiniteScenePoint(value: unknown): value is ScenePoint {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

export function safeScenePoint(
  value: unknown,
  fallback: ScenePoint = [0, 0],
): ScenePoint {
  return isFiniteScenePoint(value) ? value : fallback;
}

export function positiveFinite(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function roomById(
  rooms: readonly PresentationRoom[],
  roomId: RoomId | undefined,
) {
  return roomId ? rooms.find((room) => room.id === roomId) : undefined;
}

export function tileById(
  tiles: readonly PresentationTile[],
  tileId: string | undefined,
) {
  return tileId ? tiles.find((tile) => tile.id === tileId) : undefined;
}

export function resolveScenePoint(
  position: ScenePoint | undefined,
  tileId: string | undefined,
  roomId: RoomId | undefined,
  tiles: readonly PresentationTile[],
  rooms: readonly PresentationRoom[],
  roomOffset: ScenePoint = [0, 0],
): ScenePoint {
  if (isFiniteScenePoint(position)) return position;

  const tile = tileById(tiles, tileId);
  if (tile && isFiniteScenePoint(tile.position)) return tile.position;

  const room = roomById(rooms, roomId);
  if (room && isFiniteScenePoint(room.position)) {
    const offset = safeScenePoint(roomOffset);
    const resolved: ScenePoint = [
      room.position[0] + offset[0],
      room.position[1] + offset[1],
    ];
    return isFiniteScenePoint(resolved) ? resolved : [0, 0];
  }

  return [0, 0];
}

export function stableNumber(value: string | number) {
  const text = String(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

export function easeInOutCubic(value: number) {
  const safeValue = Number.isFinite(value)
    ? THREE.MathUtils.clamp(value, 0, 1)
    : 1;
  return safeValue < 0.5
    ? 4 * safeValue * safeValue * safeValue
    : 1 - Math.pow(-2 * safeValue + 2, 3) / 2;
}

export function easeOutCubic(value: number) {
  const safeValue = Number.isFinite(value)
    ? THREE.MathUtils.clamp(value, 0, 1)
    : 1;
  return 1 - Math.pow(1 - safeValue, 3);
}
