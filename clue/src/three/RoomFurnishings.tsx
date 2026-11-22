"use client";
/* eslint-disable react/no-unknown-property -- React Three Fiber intrinsic props. */

import type { ThreeElements } from "@react-three/fiber";

import type { PresentationQuality, RoomId } from "../presentation";

type Vector3Tuple = readonly [number, number, number];

interface FurnitureProps {
  position?: Vector3Tuple;
  rotation?: Vector3Tuple;
  scale?: Vector3Tuple;
  color?: string;
  metalness?: number;
  roughness?: number;
  castShadow?: boolean;
}

function FurnitureBox({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  color = "#493125",
  metalness = 0.08,
  roughness = 0.65,
  castShadow = true,
}: FurnitureProps) {
  return (
    <mesh
      castShadow={castShadow}
      receiveShadow
      position={position}
      rotation={rotation}
      scale={scale}
    >
      <boxGeometry />
      <meshStandardMaterial
        color={color}
        metalness={metalness}
        roughness={roughness}
      />
    </mesh>
  );
}

function FurnitureCylinder({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  color = "#b68a45",
  metalness = 0.55,
  roughness = 0.3,
  castShadow = true,
}: FurnitureProps) {
  return (
    <mesh
      castShadow={castShadow}
      receiveShadow
      position={position}
      rotation={rotation}
      scale={scale}
    >
      <cylinderGeometry args={[0.5, 0.5, 1, 14]} />
      <meshStandardMaterial
        color={color}
        metalness={metalness}
        roughness={roughness}
      />
    </mesh>
  );
}

function Chair({ position, rotation = [0, 0, 0], castShadow }: FurnitureProps) {
  return (
    <group position={position} rotation={rotation}>
      <FurnitureBox
        castShadow={castShadow}
        position={[0, 0.35, 0]}
        scale={[0.42, 0.12, 0.42]}
      />
      <FurnitureBox
        castShadow={castShadow}
        position={[0, 0.72, 0.18]}
        scale={[0.42, 0.7, 0.1]}
        color="#603a2b"
      />
      <FurnitureBox castShadow={castShadow} position={[-0.15, 0.16, -0.14]} scale={[0.07, 0.32, 0.07]} />
      <FurnitureBox castShadow={castShadow} position={[0.15, 0.16, -0.14]} scale={[0.07, 0.32, 0.07]} />
    </group>
  );
}

function PottedPlant({ position, scale = [1, 1, 1], castShadow }: FurnitureProps) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow={castShadow} position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.27, 0.2, 0.44, 12]} />
        <meshStandardMaterial color="#9a633d" roughness={0.72} />
      </mesh>
      <FurnitureCylinder
        castShadow={castShadow}
        color="#355f3d"
        metalness={0}
        position={[0, 0.72, 0]}
        roughness={0.82}
        scale={[0.08, 0.75, 0.08]}
      />
      {[
        [-0.22, 0.92, 0],
        [0.2, 1.02, 0.04],
        [0, 1.16, -0.08],
      ].map((leaf, index) => (
        <mesh
          castShadow={castShadow}
          key={index}
          position={leaf as [number, number, number]}
          rotation={[0, index * 1.7, index % 2 ? 0.65 : -0.65]}
          scale={[0.16, 0.42, 0.08]}
        >
          <sphereGeometry args={[1, 10, 8]} />
          <meshStandardMaterial color={index === 1 ? "#527c4d" : "#3e6d45"} roughness={0.76} />
        </mesh>
      ))}
    </group>
  );
}

function Candle({ position, castShadow }: FurnitureProps) {
  return (
    <group position={position}>
      <FurnitureCylinder
        castShadow={castShadow}
        color="#d6b36a"
        position={[0, 0.15, 0]}
        scale={[0.08, 0.3, 0.08]}
      />
      <mesh position={[0, 0.36, 0]} scale={[0.045, 0.09, 0.045]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#ffca72" emissive="#f29b38" emissiveIntensity={2.2} />
      </mesh>
    </group>
  );
}

function VelvetRug({
  color,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
}: FurnitureProps) {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh receiveShadow position={[0, 0.018, 0]}>
        <boxGeometry args={[2.8, 0.035, 1.55]} />
        <meshPhysicalMaterial color={color ?? "#5f2030"} roughness={0.82} sheen={0.9} sheenColor="#a34c62" />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, 0.042, side * 0.67]}>
          <boxGeometry args={[2.48, 0.018, 0.035]} />
          <meshStandardMaterial color="#c79b4f" metalness={0.54} roughness={0.31} />
        </mesh>
      ))}
    </group>
  );
}

function BrassLamp({ position, castShadow }: FurnitureProps) {
  return (
    <group position={position}>
      <FurnitureCylinder castShadow={castShadow} position={[0, 0.38, 0]} scale={[0.06, 0.76, 0.06]} />
      <mesh castShadow={castShadow} position={[0, 0.83, 0]}>
        <coneGeometry args={[0.28, 0.4, 18, 1, true]} />
        <meshPhysicalMaterial color="#d5a750" emissive="#9b5d24" emissiveIntensity={0.42} metalness={0.5} roughness={0.3} side={2} />
      </mesh>
      <mesh position={[0, 0.75, 0]}><sphereGeometry args={[0.075, 10, 8]} /><meshStandardMaterial color="#ffd89a" emissive="#e89a42" emissiveIntensity={3} /></mesh>
    </group>
  );
}

function BookStack({ position, rotation = [0, 0, 0], castShadow }: FurnitureProps) {
  const colors = ["#5b2030", "#264a48", "#76562e"];
  return (
    <group position={position} rotation={rotation}>
      {colors.map((color, index) => (
        <mesh key={color} castShadow={castShadow} position={[(index - 1) * 0.025, index * 0.075, 0]} rotation={[0, (index - 1) * 0.1, 0]}>
          <boxGeometry args={[0.48 - index * 0.04, 0.07, 0.31]} />
          <meshStandardMaterial color={color} roughness={0.61} />
        </mesh>
      ))}
    </group>
  );
}

function PlaceSetting({ position }: FurnitureProps) {
  return (
    <group position={position}>
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.12, 0.19, 24]} />
        <meshPhysicalMaterial color="#e7dfcf" clearcoat={0.82} roughness={0.18} />
      </mesh>
      <mesh position={[0.24, 0.025, 0]}><boxGeometry args={[0.025, 0.025, 0.34]} /><meshStandardMaterial color="#c9a35a" metalness={0.84} roughness={0.19} /></mesh>
      <mesh position={[-0.24, 0.025, 0]}><boxGeometry args={[0.025, 0.025, 0.34]} /><meshStandardMaterial color="#c9a35a" metalness={0.84} roughness={0.19} /></mesh>
    </group>
  );
}

function Observatory({ detail, castShadow }: RoomDetailProps) {
  return (
    <group>
      <VelvetRug color="#17334b" position={[0, 0, 0.2]} rotation={[0, -0.08, 0]} scale={[1.12, 1, 1.08]} />
      <group position={[0.25, 0.05, -0.1]} rotation={[0, -0.45, 0]}>
        <FurnitureCylinder castShadow={castShadow} position={[0, 0.9, 0]} scale={[0.28, 1.55, 0.28]} rotation={[0, 0, Math.PI / 2]} />
        <FurnitureCylinder castShadow={castShadow} color="#1d252d" position={[0, 0.9, 0]} scale={[0.18, 1.7, 0.18]} rotation={[0, 0, Math.PI / 2]} />
        <FurnitureCylinder castShadow={castShadow} color="#b68a45" position={[-0.82, 0.9, 0]} scale={[0.36, 0.12, 0.36]} rotation={[0, 0, Math.PI / 2]} />
        <mesh castShadow={castShadow} position={[-0.94, 0.9, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.25, 0.045, 10, 28]} />
          <meshStandardMaterial color="#d7b565" metalness={0.82} roughness={0.19} />
        </mesh>
        <FurnitureCylinder castShadow={castShadow} color="#b68a45" position={[0, 0.45, 0]} scale={[0.11, 0.9, 0.11]} />
        <FurnitureBox castShadow={castShadow} position={[0, 0.08, 0]} scale={[1.2, 0.12, 0.65]} color="#34424c" />
        {[-0.45, 0.45].map((x) => <FurnitureCylinder key={x} castShadow={castShadow} color="#9b783f" position={[x, 0.28, 0]} rotation={[0, 0, x > 0 ? -0.46 : 0.46]} scale={[0.045, 0.62, 0.045]} />)}
      </group>
      {detail && (
        <group position={[-1.45, 0, 0.65]}>
          <FurnitureCylinder castShadow={castShadow} position={[0, 0.36, 0]} scale={[0.08, 0.72, 0.08]} />
          <mesh castShadow={castShadow} position={[0, 0.75, 0]}>
            <sphereGeometry args={[0.28, 14, 10]} />
            <meshStandardMaterial color="#53728b" metalness={0.3} roughness={0.35} />
          </mesh>
          <mesh castShadow={castShadow} position={[0, 0.75, 0]} rotation={[0.4, 0.2, 0.3]}>
            <torusGeometry args={[0.38, 0.025, 8, 24]} />
            <meshStandardMaterial color="#d0a95d" metalness={0.8} roughness={0.24} />
          </mesh>
          <mesh castShadow={castShadow} position={[0, 0.75, 0]} rotation={[-0.3, 0.7, -0.5]}><torusGeometry args={[0.31, 0.018, 7, 22]} /><meshStandardMaterial color="#c39549" metalness={0.78} roughness={0.24} /></mesh>
        </group>
      )}
      {detail && <BrassLamp castShadow={castShadow} position={[1.72, 0, 1.18]} />}
    </group>
  );
}

function MapArchive({ detail, castShadow }: RoomDetailProps) {
  return (
    <group>
      <VelvetRug color="#4c2c1c" position={[0, 0, 0.22]} scale={[1.25, 1, 1.15]} />
      <FurnitureBox castShadow={castShadow} position={[0, 0.5, 0.15]} scale={[2.35, 0.16, 1.1]} />
      <FurnitureBox castShadow={castShadow} position={[-0.92, 0.25, 0.15]} scale={[0.13, 0.5, 0.8]} />
      <FurnitureBox castShadow={castShadow} position={[0.92, 0.25, 0.15]} scale={[0.13, 0.5, 0.8]} />
      <FurnitureBox castShadow={castShadow} color="#d7c69f" position={[0, 0.61, 0.15]} rotation={[0, 0.18, 0]} scale={[1.8, 0.025, 0.7]} />
      <BookStack castShadow={castShadow} position={[0.78, 0.64, -0.08]} rotation={[0, -0.18, 0]} />
      {detail && (
        <>
          <FurnitureCylinder castShadow={castShadow} color="#d8c69d" position={[-0.65, 0.68, -0.05]} rotation={[0, 0, Math.PI / 2]} scale={[0.1, 0.6, 0.1]} metalness={0} />
          <FurnitureCylinder castShadow={castShadow} color="#d8c69d" position={[0.7, 0.68, 0.35]} rotation={[0, 0, Math.PI / 2]} scale={[0.1, 0.48, 0.1]} metalness={0} />
          <FurnitureBox castShadow={castShadow} position={[0, 0.65, -1.45]} scale={[3.2, 1.15, 0.25]} color="#34251e" />
          {[-1.1, 0, 1.1].map((x) => (
            <FurnitureBox key={x} castShadow={castShadow} position={[x, 0.65, -1.58]} scale={[0.07, 1, 0.06]} color="#b68a45" metalness={0.65} />
          ))}
          {[-1.38, -0.68, 0.12, 0.82, 1.42].map((x, index) => (
            <group key={x} position={[x, 0.72, -1.61]}>
              {[0, 0.23, 0.46].map((y, bookIndex) => (
                <mesh key={y} castShadow={castShadow} position={[0, y - 0.28, 0]} rotation={[0, 0, (bookIndex - 1) * 0.07]}>
                  <boxGeometry args={[0.24 + (index % 2) * 0.04, 0.18, 0.12]} />
                  <meshStandardMaterial color={["#6c2935", "#2c5550", "#806237"][(index + bookIndex) % 3]} roughness={0.64} />
                </mesh>
              ))}
            </group>
          ))}
        </>
      )}
    </group>
  );
}

function Glasshouse({ detail, castShadow }: RoomDetailProps) {
  return (
    <group>
      {detail && [-1.55, 0, 1.55].map((x) => (
        <group key={x} position={[x, 0.92, 0]} rotation={[0, 0, Math.PI / 2]}>
          <mesh castShadow={castShadow} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.25, 0.035, 7, 24, Math.PI]} />
            <meshStandardMaterial color="#a98c58" metalness={0.72} roughness={0.28} />
          </mesh>
        </group>
      ))}
      {detail && [-1.05, 1.05].map((z) => <FurnitureCylinder key={z} castShadow={castShadow} color="#b6a06e" position={[0, 1.78, z]} rotation={[0, 0, Math.PI / 2]} scale={[0.035, 3.4, 0.035]} metalness={0.7} roughness={0.24} />)}
      <PottedPlant castShadow={castShadow} position={[-1.2, 0, -0.45]} scale={[0.9, 0.9, 0.9]} />
      <PottedPlant castShadow={castShadow} position={[1.2, 0, 0.35]} />
      {detail && <PottedPlant castShadow={castShadow} position={[0.15, 0, -0.8]} scale={[0.7, 0.65, 0.7]} />}
      <mesh receiveShadow position={[0, 0.08, 0.25]}>
        <cylinderGeometry args={[0.66, 0.78, 0.16, 24]} />
        <meshStandardMaterial color="#597b73" metalness={0.15} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.18, 0.25]}>
        <cylinderGeometry args={[0.47, 0.47, 0.04, 24]} />
        <meshPhysicalMaterial color="#73aab2" clearcoat={1} metalness={0.08} roughness={0.06} transmission={0.38} transparent opacity={0.78} />
      </mesh>
      <mesh position={[0, 0.47, 0.25]}><sphereGeometry args={[0.08, 10, 8]} /><meshStandardMaterial color="#9fdbe0" emissive="#438d92" emissiveIntensity={0.8} transparent opacity={0.72} /></mesh>
    </group>
  );
}

function PortraitSalon({ detail, castShadow }: RoomDetailProps) {
  return (
    <group>
      <VelvetRug color="#641f37" position={[0, 0, 0.15]} scale={[1.3, 1, 1.18]} />
      <FurnitureBox castShadow={castShadow} color="#6d2e42" position={[0, 0.44, 0.4]} scale={[2.15, 0.5, 0.7]} roughness={0.82} />
      <FurnitureBox castShadow={castShadow} color="#7e3b51" position={[0, 0.84, 0.67]} scale={[2.15, 0.64, 0.16]} roughness={0.82} />
      <FurnitureCylinder castShadow={castShadow} position={[-0.86, 0.16, 0.4]} scale={[0.08, 0.32, 0.08]} />
      <FurnitureCylinder castShadow={castShadow} position={[0.86, 0.16, 0.4]} scale={[0.08, 0.32, 0.08]} />
      {detail && (
        <>
          <FurnitureBox castShadow={castShadow} color="#b68a45" position={[-0.8, 0.8, -1.26]} scale={[0.86, 1.25, 0.1]} metalness={0.6} />
          <FurnitureBox castShadow={castShadow} color="#3f5664" position={[-0.8, 0.8, -1.32]} scale={[0.64, 0.98, 0.04]} />
          <FurnitureBox castShadow={castShadow} color="#b68a45" position={[0.82, 0.78, -1.26]} scale={[0.82, 1.1, 0.1]} metalness={0.6} />
          <FurnitureBox castShadow={castShadow} color="#68404e" position={[0.82, 0.78, -1.32]} scale={[0.61, 0.84, 0.04]} />
          <mesh position={[-0.8, 0.8, -1.36]}><sphereGeometry args={[0.14, 12, 9]} /><meshStandardMaterial color="#c6a384" roughness={0.52} /></mesh>
          <mesh position={[0.82, 0.79, -1.36]} scale={[0.7, 1.15, 0.5]}><sphereGeometry args={[0.14, 12, 9]} /><meshStandardMaterial color="#96705c" roughness={0.52} /></mesh>
          <BrassLamp castShadow={castShadow} position={[1.72, 0, 0.95]} />
          <group position={[-1.52, 0, 0.85]}>
            <mesh castShadow={castShadow} position={[0, 0.22, 0]}><cylinderGeometry args={[0.46, 0.52, 0.34, 20]} /><meshPhysicalMaterial color="#31504c" roughness={0.65} sheen={0.7} sheenColor="#548f84" /></mesh>
            <mesh position={[0, 0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.34, 0.42, 20]} /><meshStandardMaterial color="#b68a45" metalness={0.78} roughness={0.22} /></mesh>
          </group>
        </>
      )}
    </group>
  );
}

function Atrium({ detail, castShadow }: RoomDetailProps) {
  return (
    <group>
      <mesh receiveShadow position={[0, 0.035, 0]}>
        <cylinderGeometry args={[1.28, 1.28, 0.07, 32]} />
        <meshPhysicalMaterial color="#82745f" clearcoat={0.32} roughness={0.36} />
      </mesh>
      <mesh position={[0, 0.078, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 8]}><ringGeometry args={[0.78, 1.06, 16]} /><meshStandardMaterial color="#c6a256" metalness={0.72} roughness={0.27} /></mesh>
      <mesh castShadow={castShadow} position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.16, 0.22, 1.1, 12]} />
        <meshStandardMaterial color="#b68a45" metalness={0.75} roughness={0.25} />
      </mesh>
      <mesh position={[0, 1.15, 0]}>
        <octahedronGeometry args={[0.34]} />
        <meshStandardMaterial color="#ffd08a" emissive="#e19b3f" emissiveIntensity={1.7} transparent opacity={0.9} />
      </mesh>
      {detail &&
        [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].map((angle) => (
          <Candle
            key={angle}
            castShadow={castShadow}
            position={[Math.cos(angle) * 1.2, 0, Math.sin(angle) * 0.9]}
          />
        ))}
      {detail && [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].map((angle) => (
        <group key={`lantern-${angle}`} position={[Math.cos(angle) * 1.7, 1.18, Math.sin(angle) * 1.28]}>
          <mesh castShadow={castShadow}><cylinderGeometry args={[0.08, 0.08, 0.78, 8]} /><meshStandardMaterial color="#bb8c40" metalness={0.76} roughness={0.23} /></mesh>
          <mesh position={[0, 0.1, 0]}><octahedronGeometry args={[0.18]} /><meshStandardMaterial color="#ffc67b" emissive="#d6792a" emissiveIntensity={1.8} transparent opacity={0.9} /></mesh>
        </group>
      ))}
    </group>
  );
}

function MusicRoom({ detail, castShadow }: RoomDetailProps) {
  return (
    <group>
      <VelvetRug color="#34284d" position={[0, 0, 0.2]} scale={[1.24, 1, 1.1]} />
      <group position={[-0.35, 0, 0]} rotation={[0, -0.22, 0]}>
        <FurnitureBox castShadow={castShadow} color="#211b1c" position={[0, 0.55, 0]} scale={[1.85, 0.34, 1.05]} roughness={0.3} />
        <FurnitureBox castShadow={castShadow} color="#171516" position={[-0.55, 0.83, -0.28]} rotation={[0.18, 0, 0]} scale={[0.75, 0.12, 0.7]} roughness={0.25} />
        <FurnitureBox castShadow={castShadow} color="#e4d8bc" position={[0.4, 0.74, 0.1]} scale={[0.72, 0.04, 0.55]} roughness={0.6} />
        {Array.from({ length: 9 }, (_, index) => (
          <mesh key={index} position={[0.13 + index * 0.075, 0.78, 0.08]}>
            <boxGeometry args={[0.052, 0.035, index % 2 ? 0.34 : 0.44]} />
            <meshStandardMaterial color={index % 2 ? "#201d1e" : "#f1e7d3"} roughness={0.42} />
          </mesh>
        ))}
        {[-0.7, 0.55].map((x) => (
          <FurnitureCylinder key={x} castShadow={castShadow} color="#1c1718" position={[x, 0.23, 0.25]} scale={[0.07, 0.46, 0.07]} metalness={0.1} />
        ))}
      </group>
      {detail && <Chair castShadow={castShadow} position={[1.25, 0, 0.3]} rotation={[0, -Math.PI / 2, 0]} />}
      {detail && (
        <group position={[1.55, 0, -0.95]}>
          <FurnitureCylinder castShadow={castShadow} position={[0, 0.42, 0]} scale={[0.06, 0.84, 0.06]} />
          <mesh castShadow={castShadow} position={[0, 0.92, 0]}><torusGeometry args={[0.35, 0.04, 8, 24, Math.PI * 1.6]} /><meshStandardMaterial color="#c79b50" metalness={0.78} roughness={0.22} /></mesh>
          {[-0.18, 0, 0.18].map((x) => <mesh key={x} position={[x, 0.92, 0]}><boxGeometry args={[0.018, 0.52, 0.02]} /><meshStandardMaterial color="#e2c879" metalness={0.55} roughness={0.3} /></mesh>)}
        </group>
      )}
    </group>
  );
}

function TrophyHall({ detail, castShadow }: RoomDetailProps) {
  return (
    <group>
      <VelvetRug color="#173c3a" position={[0, 0, 0.52]} scale={[1.25, 1, 0.78]} />
      {[-1.25, 0, 1.25].map((x, index) => (
        <group key={x} position={[x, 0, index === 1 ? -0.35 : 0.3]}>
          <FurnitureBox castShadow={castShadow} color="#635444" position={[0, 0.34, 0]} scale={[0.65, 0.68, 0.65]} />
          <mesh castShadow={castShadow} position={[0, 0.92, 0]}>
            {index === 1 ? <torusKnotGeometry args={[0.2, 0.06, 48, 8]} /> : <octahedronGeometry args={[0.28]} />}
            <meshStandardMaterial color={index === 2 ? "#8d5b38" : "#c2a05d"} metalness={0.75} roughness={0.27} />
          </mesh>
          {detail && <mesh position={[0, 0.95, 0]}><boxGeometry args={[0.82, 1.15, 0.82]} /><meshPhysicalMaterial color="#9bc2c2" roughness={0.08} transmission={0.55} transparent opacity={0.22} thickness={0.18} /></mesh>}
        </group>
      ))}
      {detail && <FurnitureBox castShadow={castShadow} color="#273d3c" position={[0, 0.035, 1.25]} scale={[3.2, 0.07, 0.62]} roughness={0.85} />}
      {detail && <BrassLamp castShadow={castShadow} position={[-1.92, 0, -1.2]} />}
    </group>
  );
}

function DiningRoom({ detail, castShadow }: RoomDetailProps) {
  return (
    <group>
      <VelvetRug color="#5a241e" position={[0, 0, 0]} scale={[1.35, 1, 1.22]} />
      <FurnitureBox castShadow={castShadow} position={[0, 0.55, 0]} scale={[2.8, 0.18, 1.05]} />
      <mesh position={[0, 0.655, 0]}><boxGeometry args={[2.18, 0.025, 0.28]} /><meshPhysicalMaterial color="#8a2839" roughness={0.7} sheen={0.8} sheenColor="#bf5e6c" /></mesh>
      {[-1.14, 1.14].map((x) => (
        <FurnitureBox key={x} castShadow={castShadow} position={[x, 0.26, 0]} scale={[0.13, 0.52, 0.72]} />
      ))}
      <Chair castShadow={castShadow} position={[-1.42, 0, -0.9]} rotation={[0, 0, 0]} />
      <Chair castShadow={castShadow} position={[1.42, 0, 0.9]} rotation={[0, Math.PI, 0]} />
      {detail && (
        <>
          <Chair castShadow={castShadow} position={[0, 0, -0.9]} />
          <Chair castShadow={castShadow} position={[0, 0, 0.9]} rotation={[0, Math.PI, 0]} />
          <Candle castShadow={castShadow} position={[-0.55, 0.65, 0]} />
          <Candle castShadow={castShadow} position={[0.55, 0.65, 0]} />
          {[-0.86, 0, 0.86].flatMap((x) => [-0.31, 0.31].map((z) => <PlaceSetting key={`${x}-${z}`} position={[x, 0.68, z]} />))}
          <mesh position={[0, 0.71, 0]}><cylinderGeometry args={[0.19, 0.22, 0.06, 22]} /><meshPhysicalMaterial color="#d9b765" clearcoat={0.62} metalness={0.5} roughness={0.2} /></mesh>
          <mesh position={[0, 0.87, 0]} scale={[0.34, 0.18, 0.28]}><sphereGeometry args={[1, 14, 10]} /><meshStandardMaterial color="#6a8b4e" roughness={0.7} /></mesh>
        </>
      )}
    </group>
  );
}

function Kitchen({ detail, castShadow }: RoomDetailProps) {
  return (
    <group>
      <mesh receiveShadow position={[0, 0.025, 0.08]}><boxGeometry args={[3.7, 0.045, 2.4]} /><meshStandardMaterial color="#504a43" roughness={0.55} /></mesh>
      {[-1.2, -0.4, 0.4, 1.2].map((x) => <mesh key={x} position={[x, 0.052, 0.08]}><boxGeometry args={[0.025, 0.018, 2.25]} /><meshStandardMaterial color="#b58a50" metalness={0.52} roughness={0.32} /></mesh>)}
      <FurnitureBox castShadow={castShadow} color="#3e3a36" position={[0, 0.62, -1.28]} scale={[3.6, 1.1, 0.55]} />
      <FurnitureBox castShadow={castShadow} color="#a96d45" position={[0, 1.18, -1.28]} scale={[3.75, 0.06, 0.62]} metalness={0.45} roughness={0.32} />
      <FurnitureBox castShadow={castShadow} position={[0, 0.56, 0.3]} scale={[2.2, 0.15, 1]} />
      <FurnitureBox castShadow={castShadow} position={[-0.82, 0.25, 0.3]} scale={[0.12, 0.5, 0.7]} />
      <FurnitureBox castShadow={castShadow} position={[0.82, 0.25, 0.3]} scale={[0.12, 0.5, 0.7]} />
      {detail && (
        <>
          {[-0.85, 0, 0.85].map((x) => (
            <group key={x} position={[x, 1.25, -1.58]} rotation={[Math.PI / 2, 0, 0]}>
              <mesh castShadow={castShadow}>
                <torusGeometry args={[0.22, 0.055, 8, 18]} />
                <meshStandardMaterial color="#b66f46" metalness={0.65} roughness={0.3} />
              </mesh>
            </group>
          ))}
          <FurnitureBox castShadow={castShadow} color="#171719" position={[0.65, 1.21, -1.62]} scale={[0.62, 0.03, 0.34]} />
          {[-0.18, 0.18].map((x) => <mesh key={x} position={[0.65 + x, 1.25, -1.62]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.12, 0.025, 8, 18]} /><meshStandardMaterial color="#a75f3c" emissive="#5e1d13" emissiveIntensity={0.34} metalness={0.52} roughness={0.3} /></mesh>)}
          <group position={[-1.34, 1.36, -1.42]}>
            <mesh castShadow={castShadow}><cylinderGeometry args={[0.24, 0.3, 0.42, 18]} /><meshPhysicalMaterial color="#b86e42" clearcoat={0.38} metalness={0.64} roughness={0.25} /></mesh>
            <mesh position={[0, 0.22, 0]}><torusGeometry args={[0.17, 0.03, 8, 18]} /><meshStandardMaterial color="#d39661" metalness={0.7} roughness={0.23} /></mesh>
          </group>
          <mesh position={[0, 1.76, -1.15]}><boxGeometry args={[2.6, 0.05, 0.05]} /><meshStandardMaterial color="#c3924c" metalness={0.78} roughness={0.22} /></mesh>
          {[-0.95, -0.32, 0.32, 0.95].map((x) => <mesh key={x} position={[x, 1.5, -1.15]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.2, 0.045, 8, 18]} /><meshStandardMaterial color="#b36b40" metalness={0.72} roughness={0.25} /></mesh>)}
        </>
      )}
    </group>
  );
}

interface RoomDetailProps {
  detail: boolean;
  castShadow: boolean;
}

export interface RoomFurnishingsProps {
  roomId: RoomId;
  quality: PresentationQuality;
}

export function RoomFurnishings({ roomId, quality }: RoomFurnishingsProps) {
  const detail = quality === "high";
  const castShadow = quality === "high";
  const props = { detail, castShadow };

  switch (roomId) {
    case "star-observatory":
      return <Observatory {...props} />;
    case "map-archive":
      return <MapArchive {...props} />;
    case "winter-glasshouse":
      return <Glasshouse {...props} />;
    case "portrait-salon":
      return <PortraitSalon {...props} />;
    case "lantern-atrium":
      return <Atrium {...props} />;
    case "music-conservatory":
      return <MusicRoom {...props} />;
    case "trophy-hall":
      return <TrophyHall {...props} />;
    case "cedar-dining-room":
      return <DiningRoom {...props} />;
    case "copper-kitchen":
      return <Kitchen {...props} />;
  }
}

// Keeps ThreeElements in the emitted declaration graph when projects augment R3F JSX.
export type PresentationMeshProps = ThreeElements["mesh"];
