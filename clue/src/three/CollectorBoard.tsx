"use client";
/* eslint-disable react/no-unknown-property -- React Three Fiber intrinsic props. */

import { Html, RoundedBox } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import {
  PRESENTATION_COLORS,
  type MansionSceneCallbacks,
  type PresentationQuality,
  type PresentationRoom,
  type RoomId,
} from "../presentation";
import {
  BOARD_DEPTH,
  BOARD_SURFACE_Y,
  BOARD_WIDTH,
  positiveFinite,
  safeScenePoint,
} from "./scene-utils";
import { RoomFurnishings } from "./RoomFurnishings";

interface WallSideProps {
  side: "north" | "east" | "south" | "west";
  hasDoor: boolean;
  roomSize: readonly [number, number];
  accent: string;
  castShadow: boolean;
}

function WallSide({ side, hasDoor, roomSize, accent, castShadow }: WallSideProps) {
  const horizontal = side === "north" || side === "south";
  const fullLength = horizontal ? roomSize[0] : roomSize[1];
  const doorWidth = 0.96;
  const segmentLength = (fullLength - doorWidth) / 2;
  const edgeX = horizontal ? 0 : (side === "east" ? 1 : -1) * (roomSize[0] / 2 - 0.08);
  const edgeZ = horizontal ? (side === "south" ? 1 : -1) * (roomSize[1] / 2 - 0.08) : 0;
  const makeWall = (offset: number, length: number, key: string) => (
    <group key={key} position={horizontal ? [offset, 0, edgeZ] : [edgeX, 0, offset]}>
      <mesh
        castShadow={castShadow}
        position={[0, 0.43, 0]}
        receiveShadow
        scale={horizontal ? [length, 0.76, 0.17] : [0.17, 0.76, length]}
      >
        <boxGeometry />
        <meshPhysicalMaterial color="#2a1a15" clearcoat={0.24} metalness={0.05} roughness={0.46} />
      </mesh>
      <mesh
        position={[0, 0.27, horizontal ? 0.091 : 0]}
        scale={horizontal ? [length - 0.1, 0.19, 0.018] : [0.018, 0.19, length - 0.1]}
      >
        <boxGeometry />
        <meshStandardMaterial color="#5b3829" metalness={0.08} roughness={0.43} />
      </mesh>
      <mesh
        position={[0, 0.825, 0]}
        scale={horizontal ? [length + 0.04, 0.045, 0.21] : [0.21, 0.045, length + 0.04]}
      >
        <boxGeometry />
        <meshStandardMaterial color="#c3974f" metalness={0.82} roughness={0.21} />
      </mesh>
      <mesh
        position={[0, 0.08, 0]}
        scale={horizontal ? [length + 0.03, 0.11, 0.22] : [0.22, 0.11, length + 0.03]}
      >
        <boxGeometry />
        <meshStandardMaterial color="#171313" metalness={0.18} roughness={0.36} />
      </mesh>
    </group>
  );

  if (!hasDoor) return makeWall(0, fullLength, side);

  const offset = doorWidth / 2 + segmentLength / 2;
  return (
    <group>
      {makeWall(-offset, segmentLength, `${side}-a`)}
      {makeWall(offset, segmentLength, `${side}-b`)}
      {[-1, 1].map((direction) => (
        <mesh
          castShadow={castShadow}
          key={direction}
          position={horizontal
            ? [direction * (doorWidth / 2 + 0.055), 0.44, edgeZ]
            : [edgeX, 0.44, direction * (doorWidth / 2 + 0.055)]}
          scale={horizontal ? [0.08, 0.84, 0.23] : [0.23, 0.84, 0.08]}
        >
          <boxGeometry />
          <meshStandardMaterial color="#bd8d43" metalness={0.77} roughness={0.24} />
        </mesh>
      ))}
      <mesh
        position={horizontal ? [0, 0.84, edgeZ] : [edgeX, 0.84, 0]}
        scale={horizontal ? [doorWidth + 0.18, 0.08, 0.23] : [0.23, 0.08, doorWidth + 0.18]}
      >
        <boxGeometry />
        <meshStandardMaterial color="#d0a657" metalness={0.8} roughness={0.21} />
      </mesh>
      <mesh
        position={horizontal ? [0, 0.085, edgeZ] : [edgeX, 0.085, 0]}
        rotation={[-Math.PI / 2, 0, horizontal ? 0 : Math.PI / 2]}
      >
        <planeGeometry args={[doorWidth, 0.16]} />
        <meshStandardMaterial color={accent} metalness={0.72} roughness={0.26} />
      </mesh>
    </group>
  );
}

function RoomFloorInlay({
  detailed,
  room,
  size,
}: {
  detailed: boolean;
  room: PresentationRoom;
  size: readonly [number, number];
}) {
  const width = size[0] - 0.45;
  const depth = size[1] - 0.45;
  const stripes = room.id === "lantern-atrium" ? 8 : 5;
  return (
    <group position={[0, 0.115, 0]}>
      {detailed && [-1, 1].map((direction) => (
        <group key={direction}>
          <mesh position={[direction * (width / 2 - 0.06), 0, 0]}>
            <boxGeometry args={[0.045, 0.018, depth]} />
            <meshStandardMaterial color={room.accent} metalness={0.62} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, direction * (depth / 2 - 0.06)]}>
            <boxGeometry args={[width, 0.018, 0.045]} />
            <meshStandardMaterial color={room.accent} metalness={0.62} roughness={0.3} />
          </mesh>
        </group>
      ))}
      {detailed && Array.from({ length: stripes }, (_, index) => {
        const t = (index + 1) / (stripes + 1);
        const offset = -width / 2 + width * t;
        return (
          <mesh key={index} position={[offset, -0.002, 0]} rotation={[0, index % 2 ? 0.05 : -0.05, 0]}>
            <boxGeometry args={[0.018, 0.012, depth - 0.2]} />
            <meshStandardMaterial color="#b98a4c" metalness={0.38} roughness={0.42} />
          </mesh>
        );
      })}
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <ringGeometry args={[0.32, 0.38, room.id === "lantern-atrium" ? 8 : 4]} />
        <meshStandardMaterial color={room.accent} metalness={0.7} roughness={0.28} />
      </mesh>
    </group>
  );
}

function CornerOrnament({ x, z, castShadow }: { x: number; z: number; castShadow: boolean }) {
  return (
    <group position={[x, 0.66, z]}>
      <mesh castShadow={castShadow}>
        <cylinderGeometry args={[0.24, 0.3, 0.34, 24]} />
        <meshPhysicalMaterial color="#c18f43" clearcoat={0.65} metalness={0.84} roughness={0.18} />
      </mesh>
      <mesh position={[0, 0.19, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.1, 0.2, 12]} />
        <meshStandardMaterial color="#f1d58c" metalness={0.75} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.205, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <circleGeometry args={[0.07, 4]} />
        <meshPhysicalMaterial color="#6a2431" clearcoat={0.4} metalness={0.2} roughness={0.32} />
      </mesh>
    </group>
  );
}

function SecretPassageInlay({ roomId }: { roomId: RoomId }) {
  const corner = roomId === "star-observatory" || roomId === "trophy-hall" ? -1 : 1;
  return (
    <group position={[corner * 1.7, 0.105, roomId.includes("observatory") || roomId.includes("glasshouse") ? -1.15 : 1.15]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.22, 0.34, 24]} />
        <meshStandardMaterial color={PRESENTATION_COLORS.brassBright} metalness={0.74} roughness={0.27} />
      </mesh>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, corner * 0.65]}>
        <coneGeometry args={[0.11, 0.28, 3]} />
        <meshStandardMaterial color={PRESENTATION_COLORS.parchment} metalness={0.2} roughness={0.45} />
      </mesh>
    </group>
  );
}

interface RoomModelProps extends Pick<MansionSceneCallbacks, "onRoomHover" | "onRoomSelect"> {
  active: boolean;
  quality: PresentationQuality;
  room: PresentationRoom;
  showLabel: boolean;
}

function RoomModel({
  active,
  onRoomHover,
  onRoomSelect,
  quality,
  room,
  showLabel,
}: RoomModelProps) {
  const [hovered, setHovered] = useState(false);
  const secretRoom = [
    "star-observatory",
    "winter-glasshouse",
    "trophy-hall",
    "copper-kitchen",
  ].includes(room.id);
  const castShadow = quality === "high";
  const position = safeScenePoint(room.position);
  const size = [
    Math.max(1, positiveFinite(room.size[0], 5.25)),
    Math.max(1, positiveFinite(room.size[1], 4)),
  ] as const;

  return (
    <group position={[position[0], BOARD_SURFACE_Y + 0.12, position[1]]}>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onRoomSelect?.(room.id);
        }}
        onPointerEnter={(event) => {
          event.stopPropagation();
          setHovered(true);
          onRoomHover?.(room.id);
        }}
        onPointerLeave={() => {
          setHovered(false);
          onRoomHover?.(null);
        }}
        receiveShadow
        scale={[size[0], 0.16, size[1]]}
      >
        <boxGeometry />
        <meshStandardMaterial
          color={active || hovered ? room.accent : room.floor}
          emissive={active ? room.accent : "#000000"}
          emissiveIntensity={active ? 0.13 : hovered ? 0.045 : 0}
          metalness={0.12}
          roughness={0.53}
        />
      </mesh>

      <mesh position={[0, 0.095, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size[0] - 0.42, size[1] - 0.42]} />
        <meshPhysicalMaterial color={room.floor} clearcoat={0.22} roughness={0.48} />
      </mesh>
      {quality !== "low" && <RoomFloorInlay detailed={quality === "high"} room={room} size={size} />}

      {(["north", "east", "south", "west"] as const).map((side) => (
        <WallSide
          accent={room.accent}
          castShadow={castShadow}
          hasDoor={room.doors.includes(side)}
          key={side}
          roomSize={size}
          side={side}
        />
      ))}

      {quality !== "low" && <RoomFurnishings quality={quality} roomId={room.id} />}
      {secretRoom && <SecretPassageInlay roomId={room.id} />}

      {showLabel && quality !== "low" && (
        <Html
          center
          distanceFactor={13}
          position={[0, 0.22, size[1] / 2 - 0.34]}
          transform
          zIndexRange={[2, 0]}
        >
          <div
            aria-hidden="true"
            style={{
              background: "linear-gradient(180deg, #cba65f, #8c642d)",
              border: "1px solid rgba(255,236,188,.75)",
              borderRadius: "3px",
              boxShadow: "0 2px 8px rgba(0,0,0,.45)",
              color: "#201812",
              fontFamily: "Georgia, serif",
              fontSize: "8px",
              fontWeight: 700,
              letterSpacing: ".9px",
              lineHeight: 1,
              padding: "4px 8px 3px",
              pointerEvents: "none",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {room.name}
          </div>
        </Html>
      )}
    </group>
  );
}

const PARQUET_TILES = [
  ...[-2.75, 2.75].flatMap((z) =>
    Array.from({ length: 13 }, (_, index) => ({
      color: index % 2 ? "#533627" : "#69432e",
      position: [-9.6 + index * 1.6, BOARD_SURFACE_Y + 0.132, z] as const,
      rotation: index % 2 ? 0.16 : -0.16,
    })),
  ),
  ...[-3.5, 3.5].flatMap((x) =>
    Array.from({ length: 10 }, (_, index) => ({
      color: index % 2 ? "#4b3025" : "#64402e",
      position: [x, BOARD_SURFACE_Y + 0.134, -7.25 + index * 1.6] as const,
      rotation: index % 2 ? Math.PI / 2 + 0.16 : Math.PI / 2 - 0.16,
    })),
  ),
] as const;

function CorridorParquet() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const transform = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    PARQUET_TILES.forEach((tile, index) => {
      transform.position.set(...tile.position);
      transform.rotation.set(0, tile.rotation, 0);
      transform.scale.set(1, 1, 1);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      mesh.setColorAt(index, new THREE.Color(tile.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [transform]);

  return (
    <instancedMesh
      args={[undefined, undefined, PARQUET_TILES.length]}
      frustumCulled={false}
      receiveShadow
      ref={ref}
    >
      <boxGeometry args={[1.35, 0.022, 0.78]} />
      <meshStandardMaterial metalness={0.05} roughness={0.48} vertexColors />
    </instancedMesh>
  );
}

interface CollectorBoardProps extends Pick<
  MansionSceneCallbacks,
  "onRoomHover" | "onRoomSelect"
> {
  activeRoomId?: RoomId | null;
  quality: PresentationQuality;
  rooms: readonly PresentationRoom[];
  showRoomLabels: boolean;
}

export function CollectorBoard({
  activeRoomId,
  onRoomHover,
  onRoomSelect,
  quality,
  rooms,
  showRoomLabels,
}: CollectorBoardProps) {
  const castShadow = quality === "high";

  return (
    <group>
      <RoundedBox
        args={[BOARD_WIDTH + 2.5, 0.76, BOARD_DEPTH + 2.5]}
        castShadow={castShadow}
        position={[0, -0.61, 0]}
        radius={0.7}
        receiveShadow
        smoothness={5}
      >
        <meshPhysicalMaterial color="#130e0c" clearcoat={0.25} metalness={0.12} roughness={0.42} />
      </RoundedBox>
      <RoundedBox
        args={[BOARD_WIDTH + 1.86, 0.22, BOARD_DEPTH + 1.86]}
        position={[0, -0.16, 0]}
        radius={0.46}
        receiveShadow
        smoothness={4}
      >
        <meshPhysicalMaterial color="#6a402e" clearcoat={0.62} metalness={0.06} roughness={0.31} />
      </RoundedBox>
      <RoundedBox
        args={[BOARD_WIDTH + 1.45, 0.08, BOARD_DEPTH + 1.45]}
        position={[0, -0.015, 0]}
        radius={0.38}
        smoothness={4}
      >
        <meshStandardMaterial color="#c59649" metalness={0.83} roughness={0.2} />
      </RoundedBox>

      <RoundedBox
        args={[BOARD_WIDTH + 0.9, 0.72, BOARD_DEPTH + 0.9]}
        castShadow={castShadow}
        position={[0, 0.02, 0]}
        radius={0.32}
        receiveShadow
        smoothness={4}
      >
        <meshPhysicalMaterial color={PRESENTATION_COLORS.walnut} clearcoat={0.48} metalness={0.08} roughness={0.36} />
      </RoundedBox>
      <RoundedBox
        args={[BOARD_WIDTH + 0.28, 0.12, BOARD_DEPTH + 0.28]}
        position={[0, 0.41, 0]}
        radius={0.16}
        receiveShadow
        smoothness={3}
      >
        <meshPhysicalMaterial color={PRESENTATION_COLORS.brass} clearcoat={0.54} metalness={0.82} roughness={0.2} />
      </RoundedBox>
      <mesh position={[0, BOARD_SURFACE_Y, 0]} receiveShadow>
        <boxGeometry args={[BOARD_WIDTH, 0.12, BOARD_DEPTH]} />
        <meshPhysicalMaterial color="#121a1a" clearcoat={0.16} metalness={0.08} roughness={0.53} />
      </mesh>

      {[-2.75, 2.75].map((z) => (
        <RoundedBox key={`h-${z}`} args={[20.8, 0.08, 1.28]} position={[0, BOARD_SURFACE_Y + 0.08, z]} radius={0.14} smoothness={2}>
          <meshPhysicalMaterial color="#3a281f" clearcoat={0.3} metalness={0.1} roughness={0.46} />
        </RoundedBox>
      ))}
      {[-3.5, 3.5].map((x) => (
        <RoundedBox key={`v-${x}`} args={[1.28, 0.08, 16.8]} position={[x, BOARD_SURFACE_Y + 0.08, 0]} radius={0.14} smoothness={2}>
          <meshPhysicalMaterial color="#3a281f" clearcoat={0.3} metalness={0.1} roughness={0.46} />
        </RoundedBox>
      ))}

      <CorridorParquet />

      {rooms.map((room) => (
        <RoomModel
          active={activeRoomId === room.id}
          key={room.id}
          onRoomHover={onRoomHover}
          onRoomSelect={onRoomSelect}
          quality={quality}
          room={room}
          showLabel={showRoomLabels}
        />
      ))}

      {[
        [-10.65, -8.65],
        [10.65, -8.65],
        [-10.65, 8.65],
        [10.65, 8.65],
      ].map(([x, z]) => <CornerOrnament castShadow={castShadow} key={`${x}-${z}`} x={x} z={z} />)}

      {[-1, 1].map((side) => (
        <group key={side} position={[side * (BOARD_WIDTH / 2 + 0.52), 0.29, 0]}>
          {[-5.7, -2.85, 0, 2.85, 5.7].map((z) => (
            <mesh key={z} position={[0, 0, z]} rotation={[0, 0, Math.PI / 4]}>
              <boxGeometry args={[0.06, 0.06, 1.45]} />
              <meshStandardMaterial color="#ddb765" metalness={0.84} roughness={0.2} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
