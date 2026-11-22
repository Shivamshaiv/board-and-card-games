"use client";
/* eslint-disable react/no-unknown-property -- React Three Fiber intrinsic props. */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";

import {
  PRESENTATION_COLORS,
  SUSPECT_PALETTES,
  type MansionSceneCallbacks,
  type PresentationQuality,
  type PresentationRoom,
  type PresentationTile,
  type ScenePiece,
  type ScenePoint,
  type SceneWeapon,
  type SuspectKind,
  type WeaponKind,
} from "../presentation";
import { BOARD_SURFACE_Y, resolveScenePoint, stableNumber } from "./scene-utils";

interface SmoothGroupProps {
  children: ReactNode;
  point: ScenePoint;
  reducedMotion: boolean;
  selected?: boolean;
}

function SmoothGroup({ children, point, reducedMotion, selected }: SmoothGroupProps) {
  const ref = useRef<THREE.Group>(null);
  const invalidate = useThree((state) => state.invalidate);
  const [pointX, pointZ] = point;
  const target = useMemo(
    () => new THREE.Vector3(pointX, BOARD_SURFACE_Y + 0.19, pointZ),
    [pointX, pointZ],
  );

  useEffect(() => {
    if (ref.current && reducedMotion) ref.current.position.copy(target);
    invalidate();
  }, [invalidate, reducedMotion, target]);

  useFrame((_, delta) => {
    const group = ref.current;
    if (!group) return;
    const smoothing = reducedMotion ? 1 : 1 - Math.exp(-delta * 6.2);
    group.position.x = THREE.MathUtils.lerp(group.position.x, target.x, smoothing);
    group.position.z = THREE.MathUtils.lerp(group.position.z, target.z, smoothing);
    const desiredY = target.y + (selected ? 0.07 : 0);
    group.position.y = THREE.MathUtils.lerp(
      group.position.y,
      desiredY,
      smoothing,
    );
    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, 0, smoothing);
    const stillMoving =
      Math.abs(group.position.x - target.x) > 0.001 ||
      Math.abs(group.position.y - desiredY) > 0.001 ||
      Math.abs(group.position.z - target.z) > 0.001 ||
      Math.abs(group.rotation.y) > 0.001;
    if (stillMoving) invalidate();
  });

  return <group position={[target.x, target.y, target.z]} ref={ref}>{children}</group>;
}

function MiniatureBase({ accent, castShadow, eliminated }: { accent: string; castShadow: boolean; eliminated: boolean }) {
  const color = eliminated ? "#55514c" : accent;
  return (
    <group>
      <mesh castShadow={castShadow} receiveShadow position={[0, 0.055, 0]}>
        <cylinderGeometry args={[0.47, 0.52, 0.11, 32]} />
        <meshPhysicalMaterial color="#171313" clearcoat={0.55} metalness={0.42} roughness={0.3} />
      </mesh>
      <mesh castShadow={castShadow} receiveShadow position={[0, 0.135, 0]}>
        <cylinderGeometry args={[0.42, 0.46, 0.09, 32]} />
        <meshPhysicalMaterial color={color} clearcoat={0.72} metalness={0.38} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.187, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.27, 0.38, 32]} />
        <meshStandardMaterial color={PRESENTATION_COLORS.brassBright} metalness={0.84} roughness={0.19} />
      </mesh>
      {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle) => (
        <mesh key={angle} position={[Math.cos(angle) * 0.325, 0.203, Math.sin(angle) * 0.325]}>
          <sphereGeometry args={[0.026, 8, 6]} />
          <meshStandardMaterial color="#f2cf7c" metalness={0.88} roughness={0.16} />
        </mesh>
      ))}
    </group>
  );
}

function Head({ castShadow, hair, position, skin, scale = 1 }: { castShadow: boolean; hair: string; position: readonly [number, number, number]; skin: string; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow={castShadow}>
        <sphereGeometry args={[0.225, 18, 13]} />
        <meshStandardMaterial color={skin} roughness={0.52} />
      </mesh>
      <mesh castShadow={castShadow} position={[0, 0.115, -0.035]} scale={[1.03, 0.62, 1.04]}>
        <sphereGeometry args={[0.233, 16, 11, 0, Math.PI * 2, 0, Math.PI / 1.55]} />
        <meshStandardMaterial color={hair} roughness={0.76} />
      </mesh>
    </group>
  );
}

function AmaraFigure({ castShadow }: { castShadow: boolean }) {
  const palette = SUSPECT_PALETTES["amara-saye"];
  return (
    <group>
      <mesh castShadow={castShadow} position={[0, 0.69, 0]}>
        <cylinderGeometry args={[0.48, 0.31, 0.96, 20]} />
        <meshPhysicalMaterial color={palette.primary} clearcoat={0.28} roughness={0.42} />
      </mesh>
      <mesh castShadow={castShadow} position={[0, 1.16, 0]}>
        <cylinderGeometry args={[0.24, 0.32, 0.52, 16]} />
        <meshStandardMaterial color={palette.dark} roughness={0.46} />
      </mesh>
      <mesh castShadow={castShadow} position={[0.08, 1.13, 0.235]} rotation={[0, 0, -0.25]}>
        <boxGeometry args={[0.13, 0.64, 0.05]} />
        <meshPhysicalMaterial color={palette.secondary} clearcoat={0.44} metalness={0.12} roughness={0.32} />
      </mesh>
      <Head castShadow={castShadow} hair="#1b1716" position={[0, 1.61, 0]} skin="#875a43" />
      <mesh castShadow={castShadow} position={[0, 1.83, -0.11]}>
        <sphereGeometry args={[0.13, 12, 9]} />
        <meshStandardMaterial color="#1b1716" roughness={0.8} />
      </mesh>
      <group position={[0.34, 1.18, 0.02]} rotation={[0, 0, -0.22]}>
        <mesh castShadow={castShadow} position={[0, -0.1, 0]}>
          <cylinderGeometry args={[0.018, 0.023, 0.7, 7]} />
          <meshStandardMaterial color="#bd8c42" metalness={0.45} roughness={0.36} />
        </mesh>
        {[[-0.09, 0.08], [0.1, 0.24], [-0.08, 0.4]].map(([x, y], index) => (
          <mesh key={index} position={[x, y - 0.32, 0]} rotation={[0, 0, x > 0 ? -0.6 : 0.6]} scale={[0.07, 0.17, 0.035]}>
            <sphereGeometry args={[1, 9, 7]} />
            <meshStandardMaterial color={index === 1 ? "#7faf68" : "#5c8c58"} roughness={0.72} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function EliasFigure({ castShadow }: { castShadow: boolean }) {
  const palette = SUSPECT_PALETTES["elias-rook"];
  return (
    <group>
      <mesh castShadow={castShadow} position={[0, 0.84, 0]} scale={[0.58, 1.15, 0.39]}>
        <boxGeometry />
        <meshPhysicalMaterial color={palette.primary} clearcoat={0.2} roughness={0.43} />
      </mesh>
      <mesh castShadow={castShadow} position={[0, 1.27, 0]} scale={[0.78, 0.18, 0.44]}>
        <boxGeometry />
        <meshStandardMaterial color={palette.dark} roughness={0.46} />
      </mesh>
      {[-0.16, 0.16].map((x) => (
        <mesh key={x} castShadow={castShadow} position={[x, 1.08, 0.215]} rotation={[0, 0, x > 0 ? -0.18 : 0.18]}>
          <coneGeometry args={[0.12, 0.46, 3]} />
          <meshStandardMaterial color={palette.secondary} metalness={0.2} roughness={0.4} />
        </mesh>
      ))}
      <Head castShadow={castShadow} hair="#5a4637" position={[0, 1.6, 0]} skin="#c49371" />
      <mesh castShadow={castShadow} position={[0, 1.81, 0]}>
        <cylinderGeometry args={[0.38, 0.38, 0.055, 24]} />
        <meshStandardMaterial color="#28343a" roughness={0.48} />
      </mesh>
      <mesh castShadow={castShadow} position={[0, 1.94, 0]}>
        <cylinderGeometry args={[0.25, 0.29, 0.25, 18]} />
        <meshStandardMaterial color="#35434a" roughness={0.46} />
      </mesh>
      <mesh position={[0, 1.87, 0.225]} scale={[0.28, 0.035, 0.025]}>
        <boxGeometry />
        <meshStandardMaterial color={palette.secondary} metalness={0.28} roughness={0.32} />
      </mesh>
      <group position={[0.43, 0.91, 0.05]} rotation={[0, 0, -0.05]}>
        <mesh castShadow={castShadow}><cylinderGeometry args={[0.025, 0.03, 1.25, 9]} /><meshStandardMaterial color="#7a4b2d" roughness={0.62} /></mesh>
        <mesh position={[0.04, 0.64, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.12, 0.028, 7, 18, Math.PI]} /><meshStandardMaterial color="#bd7148" metalness={0.56} roughness={0.3} /></mesh>
      </group>
    </group>
  );
}

function CelesteFigure({ castShadow }: { castShadow: boolean }) {
  const palette = SUSPECT_PALETTES["celeste-maren"];
  return (
    <group>
      <mesh castShadow={castShadow} position={[0, 0.67, 0]}>
        <cylinderGeometry args={[0.63, 0.25, 0.92, 28]} />
        <meshPhysicalMaterial color={palette.primary} clearcoat={0.58} roughness={0.3} sheen={0.6} sheenColor="#c8a7dd" />
      </mesh>
      <mesh castShadow={castShadow} position={[0, 1.13, 0]}><cylinderGeometry args={[0.28, 0.42, 0.58, 20]} /><meshPhysicalMaterial color={palette.dark} clearcoat={0.5} roughness={0.32} /></mesh>
      {[-0.25, 0.25].map((x) => <mesh key={x} castShadow={castShadow} position={[x, 1.29, 0]}><sphereGeometry args={[0.15, 14, 9]} /><meshStandardMaterial color={palette.secondary} metalness={0.1} roughness={0.25} /></mesh>)}
      <Head castShadow={castShadow} hair="#8c512f" position={[0, 1.64, 0]} skin="#d0a182" />
      {Array.from({ length: 7 }, (_, index) => {
        const angle = -0.9 + index * 0.3;
        return <mesh key={index} position={[Math.sin(angle) * 0.255, 1.43 + Math.cos(angle) * 0.1, 0.205]}><sphereGeometry args={[0.034, 8, 6]} /><meshPhysicalMaterial color={palette.light} clearcoat={0.9} roughness={0.16} /></mesh>;
      })}
      <group position={[-0.38, 1.03, 0.07]} rotation={[0, -0.18, 0.28]}>
        {[0, 0.16, 0.32, 0.48].map((rotation, index) => <mesh key={rotation} rotation={[0, 0, rotation]} position={[0, 0.18, 0]}><coneGeometry args={[0.1, 0.52, 3]} /><meshStandardMaterial color={index % 2 ? palette.light : palette.secondary} metalness={0.08} roughness={0.38} /></mesh>)}
      </group>
    </group>
  );
}

function InezFigure({ castShadow }: { castShadow: boolean }) {
  const palette = SUSPECT_PALETTES["inez-calder"];
  return (
    <group>
      {[-0.15, 0.15].map((x) => <mesh key={x} castShadow={castShadow} position={[x, 0.61, 0]}><cylinderGeometry args={[0.115, 0.13, 0.76, 12]} /><meshStandardMaterial color={palette.secondary} roughness={0.44} /></mesh>)}
      <mesh castShadow={castShadow} position={[0, 1.11, 0]}><cylinderGeometry args={[0.28, 0.38, 0.67, 6]} /><meshPhysicalMaterial color={palette.primary} clearcoat={0.32} roughness={0.38} /></mesh>
      <mesh castShadow={castShadow} position={[0, 1.3, 0]} scale={[0.73, 0.12, 0.38]}><boxGeometry /><meshStandardMaterial color={palette.light} roughness={0.38} /></mesh>
      <mesh position={[0, 1.02, 0.232]} scale={[0.38, 0.075, 0.025]}><boxGeometry /><meshStandardMaterial color={palette.secondary} metalness={0.23} roughness={0.34} /></mesh>
      <Head castShadow={castShadow} hair="#161619" position={[0, 1.67, 0]} skin="#a56c4c" />
      <mesh castShadow={castShadow} position={[0, 1.84, 0]}><sphereGeometry args={[0.28, 18, 12, 0, Math.PI * 2, 0, Math.PI / 1.9]} /><meshStandardMaterial color={palette.secondary} roughness={0.52} /></mesh>
      <mesh position={[0.12, 1.72, 0.205]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.09, 0.025, 8, 18]} /><meshStandardMaterial color="#d9b769" metalness={0.66} roughness={0.27} /></mesh>
      <mesh castShadow={castShadow} position={[-0.39, 0.99, 0.02]} rotation={[0, 0, 0.1]}><boxGeometry args={[0.32, 0.56, 0.055]} /><meshStandardMaterial color="#e5d1a2" roughness={0.7} /></mesh>
    </group>
  );
}

function MateoFigure({ castShadow }: { castShadow: boolean }) {
  const palette = SUSPECT_PALETTES["mateo-vale"];
  return (
    <group>
      <mesh castShadow={castShadow} position={[0, 0.91, 0]} scale={[0.5, 1.38, 0.38]}><boxGeometry /><meshPhysicalMaterial color={palette.primary} clearcoat={0.25} roughness={0.43} /></mesh>
      <mesh castShadow={castShadow} position={[0, 1.2, 0.22]} rotation={[0, 0, -0.26]}><boxGeometry args={[0.16, 0.8, 0.045]} /><meshStandardMaterial color={palette.secondary} roughness={0.48} /></mesh>
      <mesh castShadow={castShadow} position={[-0.3, 1.2, 0]} rotation={[0, 0, -0.13]}><cylinderGeometry args={[0.085, 0.1, 0.72, 10]} /><meshStandardMaterial color={palette.dark} roughness={0.44} /></mesh>
      <Head castShadow={castShadow} hair="#30251f" position={[0, 1.7, 0]} skin="#a87855" />
      <mesh castShadow={castShadow} position={[0.04, 1.87, 0]} rotation={[0, 0, -0.12]}><cylinderGeometry args={[0.36, 0.34, 0.055, 22]} /><meshStandardMaterial color={palette.secondary} roughness={0.5} /></mesh>
      <mesh castShadow={castShadow} position={[0.04, 1.99, -0.02]} rotation={[0, 0, -0.12]}><cylinderGeometry args={[0.22, 0.27, 0.24, 18]} /><meshStandardMaterial color="#8c6d48" roughness={0.5} /></mesh>
      <group position={[0.24, 1.16, 0.31]}>
        <mesh castShadow={castShadow}><boxGeometry args={[0.42, 0.31, 0.24]} /><meshPhysicalMaterial color="#202426" clearcoat={0.4} metalness={0.28} roughness={0.31} /></mesh>
        <mesh position={[0, 0, 0.15]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.105, 0.13, 0.09, 16]} /><meshPhysicalMaterial color={palette.light} clearcoat={0.9} metalness={0.62} roughness={0.15} /></mesh>
      </group>
    </group>
  );
}

function JunFigure({ castShadow }: { castShadow: boolean }) {
  const palette = SUSPECT_PALETTES["jun-park"];
  return (
    <group>
      {[-0.15, 0.15].map((x, index) => <mesh key={x} castShadow={castShadow} position={[x, 0.57 + index * 0.035, 0]} rotation={[0, 0, index ? -0.08 : 0.08]}><cylinderGeometry args={[0.11, 0.12, 0.7, 10]} /><meshStandardMaterial color={palette.dark} roughness={0.46} /></mesh>)}
      <mesh castShadow={castShadow} position={[0, 1.08, 0]} rotation={[0, 0, -0.07]}><cylinderGeometry args={[0.26, 0.37, 0.68, 8]} /><meshPhysicalMaterial color={palette.primary} clearcoat={0.3} roughness={0.4} /></mesh>
      <mesh castShadow={castShadow} position={[0.03, 0.98, 0.25]} rotation={[0, 0, 0.68]}><boxGeometry args={[0.1, 0.77, 0.045]} /><meshStandardMaterial color={palette.secondary} metalness={0.38} roughness={0.31} /></mesh>
      <mesh position={[0, 0.86, 0.22]}><torusGeometry args={[0.25, 0.055, 8, 22]} /><meshStandardMaterial color={palette.secondary} metalness={0.72} roughness={0.22} /></mesh>
      <Head castShadow={castShadow} hair="#161819" position={[0, 1.59, 0]} skin="#bd8b68" scale={0.95} />
      <mesh castShadow={castShadow} position={[0, 1.77, -0.03]} scale={[1.05, 0.45, 1]}><sphereGeometry args={[0.235, 16, 10]} /><meshStandardMaterial color="#17191a" roughness={0.74} /></mesh>
      <group position={[0.29, 1.47, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh><torusGeometry args={[0.13, 0.032, 8, 20]} /><meshStandardMaterial color={palette.secondary} metalness={0.82} roughness={0.2} /></mesh>
        <mesh position={[0.15, -0.1, 0]} rotation={[0, 0, -0.75]}><boxGeometry args={[0.035, 0.33, 0.035]} /><meshStandardMaterial color={palette.secondary} metalness={0.82} roughness={0.2} /></mesh>
      </group>
    </group>
  );
}

function SuspectFigure({ castShadow, kind }: { castShadow: boolean; kind: SuspectKind }) {
  switch (kind) {
    case "amara-saye": return <AmaraFigure castShadow={castShadow} />;
    case "elias-rook": return <EliasFigure castShadow={castShadow} />;
    case "celeste-maren": return <CelesteFigure castShadow={castShadow} />;
    case "inez-calder": return <InezFigure castShadow={castShadow} />;
    case "mateo-vale": return <MateoFigure castShadow={castShadow} />;
    case "jun-park": return <JunFigure castShadow={castShadow} />;
  }
}

interface MiniatureProps extends Pick<MansionSceneCallbacks, "onPieceSelect"> {
  piece: ScenePiece;
  point: ScenePoint;
  quality: PresentationQuality;
  reducedMotion: boolean;
}

function Miniature({ onPieceSelect, piece, point, quality, reducedMotion }: MiniatureProps) {
  const [hovered, setHovered] = useState(false);
  const palette = SUSPECT_PALETTES[piece.suspect];
  const emphasized = hovered || piece.active || piece.selected;
  const castShadow = quality === "high";
  return (
    <SmoothGroup point={point} reducedMotion={reducedMotion} selected={emphasized}>
      <group onClick={(event) => { event.stopPropagation(); onPieceSelect?.(piece.id); }} onPointerEnter={(event) => { event.stopPropagation(); setHovered(true); }} onPointerLeave={() => setHovered(false)} scale={piece.eliminated ? 0.84 : 0.9}>
        <MiniatureBase accent={palette.primary} castShadow={castShadow} eliminated={Boolean(piece.eliminated)} />
        <group scale={piece.eliminated ? 0.94 : 1}><SuspectFigure castShadow={castShadow} kind={piece.suspect} /></group>
        {piece.eliminated && <group position={[0, 1.05, 0.36]} rotation={[0, 0, Math.PI / 4]}><mesh><boxGeometry args={[0.08, 0.72, 0.04]} /><meshStandardMaterial color="#adaca7" /></mesh><mesh rotation={[0, 0, Math.PI / 2]}><boxGeometry args={[0.08, 0.72, 0.04]} /><meshStandardMaterial color="#adaca7" /></mesh></group>}
        {emphasized && <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.57, 0.04, 8, 36]} /><meshStandardMaterial color={palette.light} emissive={palette.primary} emissiveIntensity={0.78} /></mesh>}
      </group>
    </SmoothGroup>
  );
}

interface WeaponShapeProps { castShadow: boolean; kind: WeaponKind }

function WeaponShape({ castShadow, kind }: WeaponShapeProps) {
  switch (kind) {
    case "clockmakers-hammer": return (
      <group rotation={[0.1, 0.28, -0.47]}>
        <mesh castShadow={castShadow} position={[0, 0.45, 0]}><cylinderGeometry args={[0.055, 0.075, 1.08, 12]} /><meshPhysicalMaterial color="#6b3d27" clearcoat={0.28} roughness={0.55} /></mesh>
        <mesh position={[0, 0.2, 0]}><torusGeometry args={[0.075, 0.018, 7, 18]} /><meshStandardMaterial color="#d0a95d" metalness={0.8} roughness={0.22} /></mesh>
        <mesh castShadow={castShadow} position={[0, 1.02, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.17, 0.18, 0.65, 14]} /><meshPhysicalMaterial color="#9f7a46" clearcoat={0.5} metalness={0.82} roughness={0.2} /></mesh>
        <mesh castShadow={castShadow} position={[0.38, 1.02, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.16, 0.28, 14]} /><meshStandardMaterial color="#c19a59" metalness={0.84} roughness={0.2} /></mesh>
      </group>
    );
    case "conservatory-shears": return (
      <group rotation={[0.05, 0.25, 0]}>
        {[-0.22, 0.22].map((rotation, index) => <group key={rotation} rotation={[0, 0, rotation]}><mesh castShadow={castShadow} position={[0, 0.72, 0]} scale={[0.095, 0.84, 0.04]}><coneGeometry args={[1, 1, 3]} /><meshPhysicalMaterial color="#c3c8c4" clearcoat={0.75} metalness={0.8} roughness={0.17} /></mesh><mesh position={[0, 0.05, 0]}><torusGeometry args={[0.2, 0.055, 9, 22]} /><meshStandardMaterial color={index ? "#214a38" : "#3b6d4a"} roughness={0.58} /></mesh></group>)}
        <mesh position={[0, 0.36, 0.05]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.07, 0.07, 0.09, 12]} /><meshStandardMaterial color="#d3af62" metalness={0.85} roughness={0.2} /></mesh>
      </group>
    );
    case "marble-raven": return (
      <group>
        <mesh receiveShadow position={[0, 0.09, 0]}><cylinderGeometry args={[0.39, 0.44, 0.18, 20]} /><meshPhysicalMaterial color="#ddd9cf" clearcoat={0.55} roughness={0.24} /></mesh>
        <mesh castShadow={castShadow} position={[0, 0.48, 0]} scale={[0.3, 0.5, 0.25]}><sphereGeometry args={[1, 18, 12]} /><meshPhysicalMaterial color="#242930" clearcoat={0.35} metalness={0.28} roughness={0.27} /></mesh>
        {[-1, 1].map((side) => <mesh key={side} castShadow={castShadow} position={[side * 0.26, 0.53, 0]} rotation={[0, 0, side * 0.55]} scale={[0.16, 0.5, 0.08]}><sphereGeometry args={[1, 12, 9]} /><meshStandardMaterial color="#303640" metalness={0.2} roughness={0.33} /></mesh>)}
        <mesh castShadow={castShadow} position={[0, 0.9, -0.04]}><sphereGeometry args={[0.21, 14, 10]} /><meshStandardMaterial color="#20252c" metalness={0.25} roughness={0.3} /></mesh>
        <mesh castShadow={castShadow} position={[0, 0.88, -0.27]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.09, 0.34, 4]} /><meshStandardMaterial color="#b29158" metalness={0.42} roughness={0.34} /></mesh>
      </group>
    );
    case "crystal-decanter": return (
      <group>
        <mesh castShadow={castShadow} position={[0, 0.38, 0]}><dodecahedronGeometry args={[0.4]} /><meshPhysicalMaterial color="#a8ced2" clearcoat={1} ior={1.45} metalness={0.02} roughness={0.06} transmission={0.72} thickness={0.5} transparent opacity={0.9} /></mesh>
        <mesh castShadow={castShadow} position={[0, 0.79, 0]}><cylinderGeometry args={[0.105, 0.17, 0.42, 14]} /><meshPhysicalMaterial color="#c4e0e1" clearcoat={1} ior={1.45} roughness={0.05} transmission={0.68} transparent opacity={0.9} /></mesh>
        <mesh position={[0, 0.39, 0.29]} rotation={[Math.PI / 2, 0, 0]}><circleGeometry args={[0.18, 20]} /><meshPhysicalMaterial color="#8a2337" clearcoat={0.4} roughness={0.28} /></mesh>
        <mesh castShadow={castShadow} position={[0, 1.08, 0]} rotation={[0, Math.PI / 4, 0]}><octahedronGeometry args={[0.19]} /><meshPhysicalMaterial color="#d8bc7a" clearcoat={0.72} metalness={0.5} roughness={0.18} /></mesh>
      </group>
    );
    case "bell-pull-cord": return (
      <group>
        <mesh castShadow={castShadow} position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.82, 0.82, 0.22]}><torusKnotGeometry args={[0.31, 0.07, 64, 9, 2, 3]} /><meshPhysicalMaterial color="#8f2940" clearcoat={0.2} roughness={0.64} sheen={0.7} sheenColor="#d06077" /></mesh>
        <mesh position={[0.02, 0.97, 0]}><sphereGeometry args={[0.12, 12, 9]} /><meshStandardMaterial color="#d5af62" metalness={0.78} roughness={0.22} /></mesh>
        <mesh castShadow={castShadow} position={[0.02, 1.18, 0]}><coneGeometry args={[0.2, 0.46, 18]} /><meshPhysicalMaterial color="#c39443" clearcoat={0.42} metalness={0.66} roughness={0.26} /></mesh>
        {[-0.08, 0, 0.08].map((x) => <mesh key={x} position={[x, 1.44, 0]}><cylinderGeometry args={[0.012, 0.02, 0.28, 7]} /><meshStandardMaterial color="#8f2940" roughness={0.7} /></mesh>)}
      </group>
    );
    case "telescope-counterweight": return (
      <group rotation={[0.08, 0, 0.12]}>
        <mesh castShadow={castShadow} position={[0, 0.36, 0]}><cylinderGeometry args={[0.33, 0.4, 0.64, 24]} /><meshPhysicalMaterial color="#9e7138" clearcoat={0.65} metalness={0.84} roughness={0.2} /></mesh>
        <mesh position={[0, 0.68, 0]}><torusGeometry args={[0.3, 0.045, 8, 28]} /><meshStandardMaterial color="#e1bd6e" metalness={0.88} roughness={0.16} /></mesh>
        {[0.8, 0.96, 1.12].map((y, index) => <mesh key={y} position={[0, y, 0]} rotation={[index * 0.8, 0, 0]}><torusGeometry args={[0.11, 0.032, 7, 16]} /><meshStandardMaterial color="#c69a50" metalness={0.78} roughness={0.24} /></mesh>)}
        <mesh position={[0, 1.28, 0]}><torusGeometry args={[0.19, 0.055, 9, 24]} /><meshStandardMaterial color="#deb96a" metalness={0.86} roughness={0.18} /></mesh>
      </group>
    );
  }
}

interface WeaponMiniatureProps extends Pick<MansionSceneCallbacks, "onWeaponSelect"> { point: ScenePoint; quality: PresentationQuality; reducedMotion: boolean; weapon: SceneWeapon }

function WeaponMiniature({ onWeaponSelect, point, quality, reducedMotion, weapon }: WeaponMiniatureProps) {
  const [hovered, setHovered] = useState(false);
  const emphasized = hovered || weapon.selected;
  return (
    <SmoothGroup point={point} reducedMotion={reducedMotion} selected={emphasized}>
      <group onClick={(event) => { event.stopPropagation(); onWeaponSelect?.(weapon.id); }} onPointerEnter={(event) => { event.stopPropagation(); setHovered(true); }} onPointerLeave={() => setHovered(false)} scale={0.68}>
        <mesh castShadow={quality === "high"} receiveShadow position={[0, 0.045, 0]}><cylinderGeometry args={[0.5, 0.54, 0.09, 28]} /><meshPhysicalMaterial color="#211517" clearcoat={0.55} roughness={0.31} /></mesh>
        <mesh position={[0, 0.095, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.39, 0.47, 28]} /><meshStandardMaterial color={PRESENTATION_COLORS.brass} metalness={0.84} roughness={0.2} /></mesh>
        <group position={[0, 0.1, 0]}><WeaponShape castShadow={quality === "high"} kind={weapon.weapon} /></group>
        {emphasized && <mesh position={[0, -0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.6, 0.045, 8, 32]} /><meshStandardMaterial color={PRESENTATION_COLORS.brassBright} emissive={PRESENTATION_COLORS.brass} emissiveIntensity={0.82} /></mesh>}
      </group>
    </SmoothGroup>
  );
}

export interface MiniaturesAndWeaponsProps extends Pick<MansionSceneCallbacks, "onPieceSelect" | "onWeaponSelect"> {
  pieces: readonly ScenePiece[];
  quality: PresentationQuality;
  reducedMotion: boolean;
  rooms: readonly PresentationRoom[];
  tiles: readonly PresentationTile[];
  weapons: readonly SceneWeapon[];
}

export function MiniaturesAndWeapons({ onPieceSelect, onWeaponSelect, pieces, quality, reducedMotion, rooms, tiles, weapons }: MiniaturesAndWeaponsProps) {
  return (
    <group>
      {pieces.map((piece) => {
        const angle = stableNumber(piece.id) * Math.PI * 2;
        const point = resolveScenePoint(piece.position, piece.tileId, piece.roomId, tiles, rooms, [Math.cos(angle) * 0.82, Math.sin(angle) * 0.62]);
        return <Miniature key={piece.id} onPieceSelect={onPieceSelect} piece={piece} point={point} quality={quality} reducedMotion={reducedMotion} />;
      })}
      {weapons.map((weapon) => {
        const angle = stableNumber(weapon.id) * Math.PI * 2;
        const point = resolveScenePoint(weapon.position, weapon.tileId, weapon.roomId, tiles, rooms, [Math.cos(angle) * 1.5, Math.sin(angle) * 1.1]);
        return <WeaponMiniature key={weapon.id} onWeaponSelect={onWeaponSelect} point={point} quality={quality} reducedMotion={reducedMotion} weapon={weapon} />;
      })}
    </group>
  );
}
