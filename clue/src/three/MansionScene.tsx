"use client";
/* eslint-disable react/no-unknown-property -- React Three Fiber intrinsic props. */

import { ContactShadows, Environment, Lightformer, RoundedBox, Sparkles } from "@react-three/drei";
import { useEffect, useState } from "react";

import {
  DEFAULT_PIECES,
  DEFAULT_WEAPONS,
  MANSION_ROOMS,
  MANSION_TILES,
  PRESENTATION_COLORS,
  type MansionSceneProps,
  type ScenePiece,
  type SceneWeapon,
} from "../presentation";
import { CameraRig } from "./CameraRig";
import { CollectorBoard } from "./CollectorBoard";
import { DiceVisual } from "./DiceVisual";
import { MiniaturesAndWeapons } from "./MiniaturesAndWeapons";
import { BOARD_SURFACE_Y } from "./scene-utils";
import { TileField } from "./TileField";

function CaseFileEnvelope({ castShadow }: { castShadow: boolean }) {
  return (
    <group position={[-6.7, 0.68, 10.28]} rotation={[0, 0.16, 0]}>
      <RoundedBox args={[3.5, 0.13, 2.25]} castShadow={castShadow} radius={0.08} receiveShadow smoothness={3}>
        <meshPhysicalMaterial color="#c7b687" clearcoat={0.1} metalness={0.02} roughness={0.67} />
      </RoundedBox>
      <mesh position={[0, 0.09, -0.08]} rotation={[-Math.PI / 2, 0, Math.PI]} scale={[1, 1.15, 1]}>
        <coneGeometry args={[1.58, 1.62, 3]} />
        <meshStandardMaterial color="#b8a476" roughness={0.69} />
      </mesh>
      <mesh position={[-1.3, 0.13, 0.5]} rotation={[-Math.PI / 2, 0, -0.08]}>
        <planeGeometry args={[0.74, 0.42]} />
        <meshStandardMaterial color="#eee3c5" roughness={0.75} />
      </mesh>
      <mesh castShadow={castShadow} position={[0, 0.23, 0.06]}>
        <cylinderGeometry args={[0.34, 0.36, 0.12, 28]} />
        <meshPhysicalMaterial color="#7b2032" clearcoat={0.5} metalness={0.12} roughness={0.32} />
      </mesh>
      <mesh position={[0, 0.3, 0.06]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <ringGeometry args={[0.14, 0.21, 8]} />
        <meshStandardMaterial color="#e0bb6c" metalness={0.8} roughness={0.19} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 1.56, 0.08, 0]} rotation={[0, 0, side * 0.02]}>
          <boxGeometry args={[0.035, 0.025, 1.9]} />
          <meshStandardMaterial color="#9d844f" metalness={0.2} roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
}

function SceneLighting({ quality }: { quality: "low" | "medium" | "high" }) {
  const highQuality = quality === "high";

  return (
    <>
      <ambientLight intensity={quality === "low" ? 1.05 : quality === "medium" ? 0.72 : 0.46} color="#d9c59f" />
      <hemisphereLight args={["#9eb8ce", "#1d120e", quality === "high" ? 0.9 : 1.18]} />
      <directionalLight
        castShadow={highQuality}
        color="#ffd7a1"
        intensity={highQuality ? 3.75 : 2.55}
        position={[-10, 18, 12]}
        shadow-bias={-0.00035}
        shadow-camera-bottom={-13}
        shadow-camera-far={42}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={13}
        shadow-mapSize-height={1024}
        shadow-mapSize-width={1024}
      />
      {quality !== "low" && <spotLight color="#f4c581" distance={33} intensity={highQuality ? 82 : 34} angle={0.72} penumbra={0.82} position={[-12, 18, 8]} />}
      {highQuality && (
        <>
          <pointLight color="#df914c" distance={16} intensity={30} position={[0, 5.8, 0]} />
          <pointLight color="#527da4" distance={24} intensity={28} position={[11, 8, -12]} />
          <pointLight color="#8f4160" distance={18} intensity={20} position={[-10, 5, 8]} />
        </>
      )}
      {highQuality && (
        <Environment resolution={64}>
          <Lightformer color="#fff1cf" form="rect" intensity={2.4} position={[-7, 12, 6]} rotation={[Math.PI / 2, 0, 0]} scale={[8, 8, 1]} />
          <Lightformer color="#7da0bc" form="rect" intensity={1.3} position={[10, 6, -8]} rotation={[0, -Math.PI / 3, 0]} scale={[5, 7, 1]} />
          <Lightformer color="#d69058" form="ring" intensity={1.6} position={[0, 7, 4]} rotation={[Math.PI / 2, 0, 0]} scale={4} />
        </Environment>
      )}
    </>
  );
}

function contactShadowKey(
  pieces: readonly ScenePiece[],
  weapons: readonly SceneWeapon[],
) {
  const pieceKey = pieces.map((piece) => [
    piece.id,
    piece.position?.[0],
    piece.position?.[1],
    piece.tileId,
    piece.roomId,
    piece.eliminated ? 1 : 0,
  ].join(":"));
  const weaponKey = weapons.map((weapon) => [
    weapon.id,
    weapon.position?.[0],
    weapon.position?.[1],
    weapon.tileId,
    weapon.roomId,
  ].join(":"));
  return [...pieceKey, ...weaponKey].join("|");
}

/**
 * ContactShadows is intentionally a one-frame bake. Remove the old bake while
 * pieces are travelling, then remount it once at their settled locations.
 */
function SettledContactShadows({
  locationKey,
  settleDelayMs,
}: {
  locationKey: string;
  settleDelayMs: number;
}) {
  const [bakedKey, setBakedKey] = useState(locationKey);

  useEffect(() => {
    if (bakedKey === locationKey) return;
    const timer = window.setTimeout(() => setBakedKey(locationKey), settleDelayMs);
    return () => window.clearTimeout(timer);
  }, [bakedKey, locationKey, settleDelayMs]);

  if (bakedKey !== locationKey) return null;
  return (
    <ContactShadows
      blur={2.6}
      color="#090605"
      far={4.5}
      frames={1}
      key={bakedKey}
      opacity={0.44}
      position={[0, BOARD_SURFACE_Y + 0.018, 0]}
      resolution={512}
      scale={23}
    />
  );
}

export function MansionScene({
  activeRoomId = null,
  camera = { preset: "overview" },
  dice = null,
  enableCameraInput = true,
  occupiedTileIds = [],
  onDiceSettled,
  onPieceSelect,
  onRoomHover,
  onRoomSelect,
  onTileHover,
  onTileSelect,
  onWeaponSelect,
  pathTileIds = [],
  pieces = DEFAULT_PIECES,
  quality = "high",
  reachableTileIds = [],
  reducedMotion = false,
  rooms = MANSION_ROOMS,
  selectedTileId = null,
  showRoomLabels = true,
  tiles = MANSION_TILES,
  weapons = DEFAULT_WEAPONS,
}: MansionSceneProps) {
  const shadowLocationKey = contactShadowKey(pieces, weapons);

  return (
    <>
      <color args={["#0d1111"]} attach="background" />
      <fog args={["#0b1011", 32, 58]} attach="fog" />
      <SceneLighting quality={quality} />

      <mesh position={[0, -1.05, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[32, 48]} />
        <meshPhysicalMaterial color="#07090a" clearcoat={0.18} metalness={0.08} roughness={0.5} />
      </mesh>

      <CollectorBoard
        activeRoomId={activeRoomId}
        onRoomHover={onRoomHover}
        onRoomSelect={onRoomSelect}
        quality={quality}
        rooms={rooms}
        showRoomLabels={showRoomLabels}
      />
      <TileField
        occupiedTileIds={occupiedTileIds}
        onTileHover={onTileHover}
        onTileSelect={onTileSelect}
        pathTileIds={pathTileIds}
        reachableTileIds={reachableTileIds}
        selectedTileId={selectedTileId}
        tiles={tiles}
      />
      <MiniaturesAndWeapons
        onPieceSelect={onPieceSelect}
        onWeaponSelect={onWeaponSelect}
        pieces={pieces}
        quality={quality}
        reducedMotion={reducedMotion}
        rooms={rooms}
        tiles={tiles}
        weapons={weapons}
      />
      <CaseFileEnvelope castShadow={quality === "high"} />
      {dice && (
        <DiceVisual
          dice={dice}
          highQuality={quality === "high"}
          onSettled={onDiceSettled}
          reducedMotion={reducedMotion}
        />
      )}

      {quality === "high" && !reducedMotion && (
        <Sparkles
          color={PRESENTATION_COLORS.parchment}
          count={36}
          opacity={0.22}
          scale={[24, 10, 19]}
          size={1.35}
          speed={0}
        />
      )}

      {quality === "high" && (
        <SettledContactShadows
          locationKey={shadowLocationKey}
          settleDelayMs={reducedMotion ? 0 : 950}
        />
      )}

      <CameraRig
        camera={camera}
        enableInput={enableCameraInput}
        reducedMotion={reducedMotion}
        rooms={rooms}
      />
    </>
  );
}
