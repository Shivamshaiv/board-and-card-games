"use client";
/* eslint-disable react/no-unknown-property -- React Three Fiber intrinsic props. */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { MansionSceneCallbacks, PresentationTile } from "../presentation";
import { BOARD_SURFACE_Y, safeScenePoint, tmpObject } from "./scene-utils";

const TILE_COLORS = {
  default: new THREE.Color("#3c3028"),
  occupied: new THREE.Color("#8c344b"),
  path: new THREE.Color("#f1e1bd"),
  reachable: new THREE.Color("#d3a554"),
  selected: new THREE.Color("#f4cf76"),
};

interface TileFieldProps extends Pick<
  MansionSceneCallbacks,
  "onTileHover" | "onTileSelect"
> {
  occupiedTileIds: readonly string[];
  pathTileIds: readonly string[];
  reachableTileIds: readonly string[];
  selectedTileId?: string | null;
  tiles: readonly PresentationTile[];
}

export function TileField({
  occupiedTileIds,
  onTileHover,
  onTileSelect,
  pathTileIds,
  reachableTileIds,
  selectedTileId,
  tiles,
}: TileFieldProps) {
  const tilesRef = useRef<THREE.InstancedMesh>(null);
  const pathRef = useRef<THREE.InstancedMesh>(null);
  const lastHoveredRef = useRef<string | null>(null);
  const reachable = useMemo(() => new Set(reachableTileIds), [reachableTileIds]);
  const path = useMemo(() => new Set(pathTileIds), [pathTileIds]);
  const occupied = useMemo(() => new Set(occupiedTileIds), [occupiedTileIds]);
  const tileMap = useMemo(
    () => new Map(tiles.map((tile) => [tile.id, tile])),
    [tiles],
  );
  const pathTiles = useMemo(
    () => pathTileIds.map((id) => tileMap.get(id)).filter(Boolean) as PresentationTile[],
    [pathTileIds, tileMap],
  );

  useLayoutEffect(() => {
    const mesh = tilesRef.current;
    if (!mesh) return;

    tiles.forEach((tile, index) => {
      const position = safeScenePoint(tile.position);
      const emphasized = reachable.has(tile.id) || path.has(tile.id) || selectedTileId === tile.id;
      const scale = selectedTileId === tile.id ? 1.14 : emphasized ? 1 : 0.76;
      tmpObject.position.set(
        position[0],
        BOARD_SURFACE_Y + (emphasized ? 0.205 : 0.162),
        position[1],
      );
      tmpObject.rotation.set(0, Math.PI / 8, 0);
      tmpObject.scale.set(scale, emphasized ? 1.24 : 0.66, scale);
      tmpObject.updateMatrix();
      mesh.setMatrixAt(index, tmpObject.matrix);

      const color = occupied.has(tile.id)
        ? TILE_COLORS.occupied
        : selectedTileId === tile.id
          ? TILE_COLORS.selected
          : path.has(tile.id)
            ? TILE_COLORS.path
            : reachable.has(tile.id)
              ? TILE_COLORS.reachable
              : TILE_COLORS.default;
      mesh.setColorAt(index, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [occupied, path, reachable, selectedTileId, tiles]);

  useLayoutEffect(() => {
    const mesh = pathRef.current;
    if (!mesh) return;

    const up = new THREE.Vector3(0, 1, 0);
    pathTiles.forEach((tile, index) => {
      const next = pathTiles[index + 1] ?? pathTiles[index - 1];
      const position = safeScenePoint(tile.position);
      const nextPosition = next ? safeScenePoint(next.position, position) : null;
      const direction = next
        ? new THREE.Vector3(
            nextPosition![0] - position[0],
            0,
            nextPosition![1] - position[1],
          ).normalize()
        : new THREE.Vector3(0, 0, 1);
      if (direction.lengthSq() < 0.000001) direction.set(0, 0, 1);
      tmpObject.position.set(position[0], BOARD_SURFACE_Y + 0.32, position[1]);
      tmpObject.quaternion.setFromUnitVectors(up, direction);
      tmpObject.scale.set(0.12, 0.25, 0.12);
      tmpObject.updateMatrix();
      mesh.setMatrixAt(index, tmpObject.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [pathTiles]);

  const tileFromInstance = (instanceId: number | undefined) =>
    instanceId === undefined ? undefined : tiles[instanceId];

  return (
    <group>
      <instancedMesh
        args={[undefined, undefined, tiles.length]}
        frustumCulled={false}
        onClick={(event) => {
          const tile = tileFromInstance(event.instanceId);
          if (!tile) return;
          event.stopPropagation();
          onTileSelect?.(tile.id);
        }}
        onPointerLeave={() => {
          lastHoveredRef.current = null;
          onTileHover?.(null);
        }}
        onPointerMove={(event) => {
          const tile = tileFromInstance(event.instanceId);
          if (!tile || tile.id === lastHoveredRef.current) return;
          event.stopPropagation();
          lastHoveredRef.current = tile.id;
          onTileHover?.(tile.id);
        }}
        ref={tilesRef}
        receiveShadow
      >
        <cylinderGeometry args={[0.36, 0.39, 0.065, 8]} />
        <meshStandardMaterial
          metalness={0.42}
          roughness={0.38}
          transparent
          vertexColors
          opacity={0.94}
        />
      </instancedMesh>

      {pathTiles.length > 0 && (
        <instancedMesh
          args={[undefined, undefined, pathTiles.length]}
          frustumCulled={false}
          ref={pathRef}
        >
          <coneGeometry args={[1, 1, 3]} />
          <meshStandardMaterial
            color="#f4e6c9"
            emissive="#b68a45"
            emissiveIntensity={0.45}
            metalness={0.28}
            roughness={0.35}
          />
        </instancedMesh>
      )}

      {selectedTileId && tileMap.has(selectedTileId) && (
        <mesh
          position={[
            safeScenePoint(tileMap.get(selectedTileId)!.position)[0],
            BOARD_SURFACE_Y + 0.31,
            safeScenePoint(tileMap.get(selectedTileId)!.position)[1],
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[0.43, 0.04, 8, 32]} />
          <meshStandardMaterial color="#f3ce73" emissive="#c18c37" emissiveIntensity={0.65} />
        </mesh>
      )}
    </group>
  );
}
