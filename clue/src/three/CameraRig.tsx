"use client";

import { CameraControls } from "@react-three/drei";
import { useEffect, useRef, type ComponentRef } from "react";

import type {
  PresentationRoom,
  SceneCameraState,
  ScenePoint,
} from "../presentation";
import { roomById, safeScenePoint } from "./scene-utils";

interface CameraPose {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}

function poseFor(
  camera: SceneCameraState,
  rooms: readonly PresentationRoom[],
): CameraPose {
  const room = roomById(rooms, camera.roomId);
  const point: ScenePoint = safeScenePoint(
    camera.target,
    safeScenePoint(room?.position),
  );
  const [x, z] = point;
  const outwardX = x === 0 ? 4.6 : Math.sign(x) * 4.35;
  const outwardZ = z === 0 ? 5.1 : Math.sign(z) * 4.7;

  switch (camera.preset) {
    case "movement":
      return {
        position: [x + 4.9, 6.15, z + 6.25],
        target: [x, 0.68, z],
      };
    case "room":
      return {
        position: [x + outwardX, 5.05, z + outwardZ],
        target: [x, 0.82, z],
      };
    case "card-reveal":
      return {
        position: [-3.6, 4.7, 15.1],
        target: [-6.7, 0.84, 10.25],
      };
    case "case-file":
      return {
        position: [-3.5, 5.25, 14.7],
        target: [-6.7, 0.82, 10.25],
      };
    case "overview":
    default:
      return {
        position: [12.9, 16.2, 16.8],
        target: [0, 0.46, 0],
      };
  }
}

export interface CameraRigProps {
  camera: SceneCameraState;
  enableInput: boolean;
  reducedMotion: boolean;
  rooms: readonly PresentationRoom[];
}

export function CameraRig({ camera, enableInput, reducedMotion, rooms }: CameraRigProps) {
  const controlsRef = useRef<ComponentRef<typeof CameraControls>>(null);
  const pose = poseFor(camera, rooms);
  const [positionX, positionY, positionZ] = pose.position;
  const [targetX, targetY, targetZ] = pose.target;

  useEffect(() => {
    controlsRef.current?.setLookAt(
      positionX,
      positionY,
      positionZ,
      targetX,
      targetY,
      targetZ,
      !reducedMotion,
    );
  }, [
    camera.revision,
    positionX,
    positionY,
    positionZ,
    reducedMotion,
    targetX,
    targetY,
    targetZ,
  ]);

  return (
    <CameraControls
      azimuthRotateSpeed={0.34}
      dollySpeed={0.48}
      enabled={enableInput}
      makeDefault
      maxAzimuthAngle={Math.PI * 0.36}
      maxDistance={29}
      maxPolarAngle={Math.PI * 0.46}
      minAzimuthAngle={-Math.PI * 0.36}
      minDistance={6.4}
      minPolarAngle={Math.PI * 0.16}
      mouseButtons={{ left: 0, middle: 8, right: 2, wheel: 16 }}
      ref={controlsRef}
      smoothTime={reducedMotion ? 0.01 : 0.52}
      touches={{ one: 32, two: 512, three: 0 }}
      truckSpeed={0.55}
    />
  );
}
