"use client";
/* eslint-disable react/no-unknown-property -- React Three Fiber intrinsic props. */

import { RoundedBox } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { DiceVisualState, DieValue } from "../presentation";
import { easeOutCubic, stableNumber, tmpObject } from "./scene-utils";

type Pip = readonly [x: number, y: number, z: number];

const PATTERNS: Record<DieValue, readonly [number, number][]> = {
  1: [[0, 0]],
  2: [[-0.2, -0.2], [0.2, 0.2]],
  3: [[-0.22, -0.22], [0, 0], [0.22, 0.22]],
  4: [[-0.2, -0.2], [-0.2, 0.2], [0.2, -0.2], [0.2, 0.2]],
  5: [[-0.22, -0.22], [-0.22, 0.22], [0, 0], [0.22, -0.22], [0.22, 0.22]],
  6: [[-0.2, -0.24], [-0.2, 0], [-0.2, 0.24], [0.2, -0.24], [0.2, 0], [0.2, 0.24]],
};

function buildPips() {
  const pips: Pip[] = [];
  PATTERNS[1].forEach(([u, v]) => pips.push([u, 0.505, v]));
  PATTERNS[6].forEach(([u, v]) => pips.push([u, -0.505, -v]));
  PATTERNS[2].forEach(([u, v]) => pips.push([u, v, 0.505]));
  PATTERNS[5].forEach(([u, v]) => pips.push([-u, v, -0.505]));
  PATTERNS[3].forEach(([u, v]) => pips.push([0.505, v, -u]));
  PATTERNS[4].forEach(([u, v]) => pips.push([-0.505, v, u]));
  return pips;
}

const ALL_PIPS = buildPips();

const ORIENTATIONS: Record<DieValue, readonly [number, number, number]> = {
  1: [0, 0, 0],
  2: [-Math.PI / 2, 0, 0],
  3: [0, 0, Math.PI / 2],
  4: [0, 0, -Math.PI / 2],
  5: [Math.PI / 2, 0, 0],
  6: [Math.PI, 0, 0],
};

const DIE_STARTS = [
  new THREE.Vector3(-1.4, 3.4, 5.3),
  new THREE.Vector3(1.2, 3.8, 5.9),
] as const;

function DiePips() {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    ALL_PIPS.forEach((pip, index) => {
      tmpObject.position.set(...pip);
      tmpObject.rotation.set(0, 0, 0);
      tmpObject.scale.set(1, 1, 1);
      tmpObject.updateMatrix();
      mesh.setMatrixAt(index, tmpObject.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <instancedMesh args={[undefined, undefined, ALL_PIPS.length]} frustumCulled={false} ref={ref}>
      <sphereGeometry args={[0.065, 8, 6]} />
      <meshStandardMaterial color="#241b18" roughness={0.55} />
    </instancedMesh>
  );
}

function Die({ dieRef, highQuality }: { dieRef: React.RefObject<THREE.Group | null>; highQuality: boolean }) {
  return (
    <group ref={dieRef}>
      <RoundedBox args={[1, 1, 1]} castShadow={highQuality} radius={0.13} receiveShadow smoothness={3}>
        <meshPhysicalMaterial color="#eee2c8" clearcoat={0.52} metalness={0.04} roughness={0.29} />
      </RoundedBox>
      <DiePips />
      {[-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => (
        <mesh key={`${x}-${y}-${z}`} position={[x * 0.43, y * 0.43, z * 0.43]}>
          <sphereGeometry args={[0.045, 8, 6]} />
          <meshStandardMaterial color="#bd944d" metalness={0.76} roughness={0.22} />
        </mesh>
      ))))}
    </group>
  );
}

export interface DiceVisualProps {
  dice: DiceVisualState;
  highQuality: boolean;
  reducedMotion: boolean;
  onSettled?: (rollKey: string | number) => void;
}

export function DiceVisual({ dice, highQuality, onSettled, reducedMotion }: DiceVisualProps) {
  const firstRef = useRef<THREE.Group>(null);
  const secondRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);
  const completedRef = useRef<string | number | null>(null);
  const activeKeyRef = useRef(dice.rollKey);
  const invalidate = useThree((state) => state.invalidate);
  const seed = useMemo(() => stableNumber(dice.rollKey), [dice.rollKey]);
  const finalPositions = useMemo(() => {
    const jitter = (seed - 0.5) * 0.42;
    return [
      new THREE.Vector3(-0.7 + jitter, 0.54, 0.15 - jitter * 0.4),
      new THREE.Vector3(0.7 - jitter * 0.6, 0.54, -0.05 + jitter),
    ] as const;
  }, [seed]);

  useEffect(() => {
    activeKeyRef.current = dice.rollKey;
    elapsedRef.current = 0;
    completedRef.current = null;
    invalidate();
  }, [dice.rollKey, invalidate]);

  useFrame((_, delta) => {
    const first = firstRef.current;
    const second = secondRef.current;
    if (!first || !second) return;

    const requestedDuration = (dice.durationMs ?? 1150) / 1000;
    const duration = Number.isFinite(requestedDuration)
      ? THREE.MathUtils.clamp(requestedDuration, 0.04, 5)
      : 1.15;
    if (dice.rolling && !reducedMotion) elapsedRef.current += Math.min(delta, 0.05);
    const raw = dice.rolling && !reducedMotion
      ? Math.min(1, elapsedRef.current / duration)
      : 1;
    const eased = easeOutCubic(raw);
    [first, second].forEach((group, index) => {
      const start = DIE_STARTS[index];
      const end = finalPositions[index];
      group.position.lerpVectors(start, end, eased);
      if (raw < 1) {
        group.position.y += Math.abs(Math.sin(raw * Math.PI * 3.5)) * (1 - raw) * 1.25;
      }

      const orientation = ORIENTATIONS[dice.values[index]] ?? ORIENTATIONS[1];
      const spin = (1 - eased) * Math.PI * (index === 0 ? 7.5 : 8.5);
      group.rotation.set(
        orientation[0] + spin,
        orientation[1] + spin * 0.72,
        orientation[2] + spin * 0.83,
      );
    });

    if (raw < 1) invalidate();

    if (
      raw >= 1 &&
      dice.rolling &&
      completedRef.current !== activeKeyRef.current
    ) {
      completedRef.current = activeKeyRef.current;
      onSettled?.(activeKeyRef.current);
    }
  });

  return (
    <group position={[0, 0.32, 9.9]} scale={0.78}>
      <RoundedBox args={[5.2, 0.2, 3.25]} castShadow={highQuality} position={[0, -0.02, 0]} radius={0.36} receiveShadow smoothness={4}>
        <meshPhysicalMaterial color="#171212" clearcoat={0.35} roughness={0.38} />
      </RoundedBox>
      <RoundedBox args={[4.82, 0.14, 2.88]} position={[0, 0.1, 0]} radius={0.29} receiveShadow smoothness={4}>
        <meshPhysicalMaterial color="#4f1925" roughness={0.7} sheen={0.85} sheenColor="#9b3e54" />
      </RoundedBox>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, 0.19, side * 1.31]}>
          <boxGeometry args={[4.28, 0.025, 0.035]} />
          <meshStandardMaterial color="#c79b4e" metalness={0.8} roughness={0.22} />
        </mesh>
      ))}
      <Die dieRef={firstRef} highQuality={highQuality} />
      <Die dieRef={secondRef} highQuality={highQuality} />
    </group>
  );
}
