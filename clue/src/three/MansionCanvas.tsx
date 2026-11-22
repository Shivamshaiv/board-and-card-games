"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";

import type { MansionSceneProps, PresentationQuality } from "../presentation";
import { MansionScene } from "./MansionScene";

function lowerQuality(quality: PresentationQuality): PresentationQuality {
  if (quality === "high") return "medium";
  return "low";
}

const QUALITY_RANK: Record<PresentationQuality, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function minimumQuality(
  requested: PresentationQuality,
  adaptive: PresentationQuality | null,
) {
  if (!adaptive) return requested;
  return QUALITY_RANK[adaptive] < QUALITY_RANK[requested] ? adaptive : requested;
}

function qualityForCanvas(width: number, height: number): PresentationQuality | null {
  if (width <= 680 || height <= 430) return "low";
  if (width <= 1080 || height <= 640) return "medium";
  return null;
}

export interface MansionCanvasProps extends MansionSceneProps {
  adaptiveQuality?: boolean;
  className?: string;
  style?: CSSProperties;
  onQualityChange?: (quality: PresentationQuality) => void;
}

export function MansionCanvas({
  adaptiveQuality = true,
  className,
  onQualityChange,
  quality = "high",
  style,
  ...sceneProps
}: MansionCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [adaptiveCeiling, setAdaptiveCeiling] = useState<PresentationQuality | null>(null);
  const [viewportCeiling, setViewportCeiling] = useState<PresentationQuality | null>(null);
  const responsiveQuality = adaptiveQuality
    ? minimumQuality(quality, viewportCeiling)
    : quality;
  const effectiveQuality = minimumQuality(
    responsiveQuality,
    adaptiveQuality ? adaptiveCeiling : null,
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const next = qualityForCanvas(
        entry.contentRect.width,
        entry.contentRect.height,
      );
      setViewportCeiling((current) => current === next ? current : next);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const degrade = () => {
    setAdaptiveCeiling((current) => {
      const baseline = minimumQuality(responsiveQuality, current);
      const next = lowerQuality(baseline);
      if (next !== baseline) onQualityChange?.(next);
      return next;
    });
  };

  const dpr: [number, number] =
    effectiveQuality === "high"
      ? [1, 1.35]
      : effectiveQuality === "medium"
        ? [0.85, 1.1]
        : [0.7, 0.9];

  return (
    <div
      className={className}
      ref={containerRef}
      style={{
        background: "#0d1111",
        height: "100%",
        minHeight: 420,
        overflow: "hidden",
        position: "relative",
        width: "100%",
        ...style,
      }}
    >
      <Canvas
        aria-hidden="true"
        camera={{ far: 90, fov: 31, near: 0.1, position: [13.2, 16.4, 16.8] }}
        dpr={dpr}
        flat={false}
        frameloop="demand"
        gl={{
          alpha: false,
          antialias: effectiveQuality !== "low",
          powerPreference: "high-performance",
          preserveDrawingBuffer: false,
        }}
        onCreated={({ gl, scene }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.12;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          scene.background = new THREE.Color("#0b1011");
        }}
        shadows={effectiveQuality === "high" ? "soft" : false}
      >
        {adaptiveQuality &&
          effectiveQuality === "high" &&
          sceneProps.dice?.rolling &&
          !sceneProps.reducedMotion && (
          <PerformanceMonitor
            factor={0.85}
            flipflops={1}
            onDecline={degrade}
          />
        )}
        <MansionScene {...sceneProps} quality={effectiveQuality} />
      </Canvas>
    </div>
  );
}
