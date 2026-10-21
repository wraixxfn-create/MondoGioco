"use client";
"use no memo";

import React, { useRef, useMemo, useCallback, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sphere, Html } from "@react-three/drei";
import * as THREE from "three";
import { latLngToVector3 } from "@/lib/utils";

// ============================================================
// Globe Component — Globo 3D interattivo
// ============================================================

interface GlobeProps {
  /** Callback quando l'utente clicca sul globo */
  onGlobeClick?: (lat: number, lng: number) => void;
  /** Marker da mostrare sul globo */
  markers?: GlobeMarker[];
  /** Se true, abilita il click per selezionare una posizione */
  selectable?: boolean;
  /** Rotazione automatica del globo */
  autoRotate?: boolean;
  /** Altezza del contenitore */
  height?: string;
  /** Coordinata da evidenziare (es. risposta corretta) */
  highlightCoords?: { lat: number; lng: number } | null;
}

export interface GlobeMarker {
  id: string;
  lat: number;
  lng: number;
  color?: string;
  label?: string;
  size?: number;
}

export function Globe({
  onGlobeClick,
  markers = [],
  selectable = false,
  autoRotate = true,
  height = "500px",
  highlightCoords,
}: GlobeProps) {
  return (
    <div className="relative w-full" style={{ height }}>
      <Canvas
        camera={{ position: [0, 0, 3.5], fov: 45 }}
        style={{ background: "transparent" }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 3, 5]} intensity={1} />
        <pointLight position={[-5, -3, -5]} intensity={0.3} color="#10b981" />

        <GlobeSphere
          onGlobeClick={onGlobeClick}
          selectable={selectable}
          autoRotate={autoRotate}
        />

        {/* Marker sul globo */}
        {markers.map((marker) => (
          <GlobeMarkerMesh key={marker.id} marker={marker} />
        ))}

        {/* Highlight per la posizione corretta */}
        {highlightCoords && (
          <HighlightMarker
            lat={highlightCoords.lat}
            lng={highlightCoords.lng}
          />
        )}

        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={2}
          maxDistance={6}
          rotateSpeed={0.5}
          autoRotate={autoRotate && !selectable}
          autoRotateSpeed={0.5}
        />
      </Canvas>
    </div>
  );
}

// ============================================================
// Sfera del globo con texture procedurale
// ============================================================

interface GlobeSphereProps {
  onGlobeClick?: (lat: number, lng: number) => void;
  selectable: boolean;
  autoRotate: boolean;
}

function GlobeSphere({ onGlobeClick, selectable }: GlobeSphereProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // Crea la texture procedurale del globo
  const globeTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;

    // Oceano - gradiente scuro
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, "#0c2d48");
    gradient.addColorStop(0.5, "#0a3d62");
    gradient.addColorStop(1, "#0c2d48");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1024, 512);

    // Griglia di latitudine/longitudine
    ctx.strokeStyle = "rgba(16, 185, 129, 0.15)";
    ctx.lineWidth = 0.5;
    for (let lat = -80; lat <= 80; lat += 20) {
      const y = ((90 - lat) / 180) * 512;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1024, y);
      ctx.stroke();
    }
    for (let lng = -180; lng <= 180; lng += 30) {
      const x = ((lng + 180) / 360) * 1024;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }

    // Continenti semplificati (forme approssimative)
    drawSimplifiedContinents(ctx);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);

  // Gestione click sul globo
  const handleClick = useCallback(
    (event: { point: THREE.Vector3; stopPropagation: () => void }) => {
      if (!selectable || !onGlobeClick) return;
      event.stopPropagation();

      const point = event.point;
      const lat = 90 - (Math.acos(point.y) * 180) / Math.PI;
      const lng = ((Math.atan2(point.z, -point.x) * 180) / Math.PI) - 180;
      const normalizedLng = ((lng + 540) % 360) - 180;

      onGlobeClick(lat, normalizedLng);
    },
    [selectable, onGlobeClick]
  );

  return (
    <Sphere
      ref={meshRef}
      args={[1, 64, 64]}
      onClick={handleClick as unknown as React.MouseEventHandler}
      onPointerOver={() => selectable && setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <meshPhongMaterial
        map={globeTexture}
        transparent
        opacity={0.95}
        shininess={15}
      />
      {/* Atmosfera */}
      {hovered && selectable && (
        <mesh scale={[1.02, 1.02, 1.02]}>
          <sphereGeometry args={[1, 64, 64]} />
          <meshBasicMaterial
            color="#10b981"
            transparent
            opacity={0.05}
            side={THREE.BackSide}
          />
        </mesh>
      )}
    </Sphere>
  );
}

// ============================================================
// Continenti semplificati
// ============================================================

function drawSimplifiedContinents(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "rgba(16, 185, 129, 0.25)";
  ctx.strokeStyle = "rgba(16, 185, 129, 0.5)";
  ctx.lineWidth = 1;

  // Funzione helper per convertire lat/lng in pixel
  function toPixel(lat: number, lng: number): [number, number] {
    const x = ((lng + 180) / 360) * 1024;
    const y = ((90 - lat) / 180) * 512;
    return [x, y];
  }

  function drawLandmass(points: [number, number][]) {
    if (points.length < 3) return;
    ctx.beginPath();
    const [startX, startY] = toPixel(points[0][0], points[0][1]);
    ctx.moveTo(startX, startY);
    for (let i = 1; i < points.length; i++) {
      const [x, y] = toPixel(points[i][0], points[i][1]);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Europa (approssimata)
  drawLandmass([
    [71, -10], [72, 30], [70, 40], [60, 40], [55, 38],
    [50, 40], [47, 35], [44, 28], [36, 28], [36, -6],
    [38, -10], [43, -9], [48, -5], [50, 2], [55, 8],
    [58, 5], [62, -2], [65, -5], [71, -10],
  ]);

  // Africa (approssimata)
  drawLandmass([
    [37, -10], [37, 12], [32, 32], [22, 37], [12, 44],
    [2, 42], [-5, 40], [-12, 40], [-26, 33], [-35, 20],
    [-35, 17], [-30, 28], [-15, 12], [5, -5], [5, -12],
    [15, -17], [25, -15], [30, -10], [37, -10],
  ]);

  // Asia (approssimata)
  drawLandmass([
    [72, 40], [75, 100], [72, 140], [60, 145], [55, 135],
    [50, 130], [40, 130], [35, 128], [30, 120], [22, 110],
    [10, 105], [1, 104], [-8, 110], [-8, 115], [5, 120],
    [20, 110], [25, 90], [22, 80], [8, 77], [15, 68],
    [25, 60], [30, 50], [38, 44], [42, 40], [55, 38],
    [60, 40], [70, 40], [72, 40],
  ]);

  // Nord America (approssimato)
  drawLandmass([
    [72, -170], [75, -100], [72, -60], [60, -65], [50, -55],
    [45, -65], [30, -80], [25, -80], [25, -90], [20, -100],
    [15, -90], [15, -85], [10, -84], [10, -78], [7, -77],
    [30, -115], [35, -120], [48, -125], [55, -130],
    [60, -140], [65, -168], [72, -170],
  ]);

  // Sud America (approssimato)
  drawLandmass([
    [12, -75], [10, -62], [5, -52], [0, -50], [-5, -35],
    [-15, -40], [-23, -42], [-30, -50], [-40, -62],
    [-55, -68], [-55, -72], [-45, -75], [-35, -72],
    [-20, -70], [-15, -75], [-5, -80], [0, -78],
    [5, -77], [10, -75], [12, -75],
  ]);

  // Australia (approssimata)
  drawLandmass([
    [-12, 130], [-15, 140], [-18, 146], [-25, 152],
    [-33, 152], [-38, 145], [-35, 137], [-32, 133],
    [-33, 125], [-28, 114], [-22, 114], [-15, 125],
    [-12, 130],
  ]);
}

// ============================================================
// Marker sul globo
// ============================================================

function GlobeMarkerMesh({ marker }: { marker: GlobeMarker }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const position = useMemo(
    () => latLngToVector3(marker.lat, marker.lng, 1.02),
    [marker.lat, marker.lng]
  );

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.scale.setScalar(
        (marker.size ?? 0.025) + Math.sin(state.clock.elapsedTime * 3) * 0.005
      );
    }
  });

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color={marker.color ?? "#10b981"} />
      </mesh>
      {/* Alone luminoso */}
      <mesh scale={[2, 2, 2]}>
        <sphereGeometry args={[marker.size ?? 0.025, 16, 16]} />
        <meshBasicMaterial
          color={marker.color ?? "#10b981"}
          transparent
          opacity={0.2}
        />
      </mesh>
      {marker.label && (
        <Html distanceFactor={8} position={[0, 0.06, 0]}>
          <div className="bg-slate-900/90 border border-emerald-500/30 rounded-lg px-2 py-1 text-xs text-white whitespace-nowrap pointer-events-none">
            {marker.label}
          </div>
        </Html>
      )}
    </group>
  );
}

// ============================================================
// Highlight per la posizione corretta
// ============================================================

function HighlightMarker({
  lat,
  lng,
}: {
  lat: number;
  lng: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const position = useMemo(() => latLngToVector3(lat, lng, 1.02), [lat, lng]);

  useFrame((state) => {
    if (ringRef.current) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.3;
      ringRef.current.scale.setScalar(scale);
    }
  });

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.035, 16, 16]} />
        <meshBasicMaterial color="#fbbf24" />
      </mesh>
      <mesh ref={ringRef}>
        <ringGeometry args={[0.05, 0.07, 32]} />
        <meshBasicMaterial
          color="#fbbf24"
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

// ============================================================
// Export del componente principale con error boundary
// ============================================================

interface GlobeContainerProps extends GlobeProps {
  fallbackHeight?: string;
}

export function GlobeContainer(props: GlobeContainerProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    // Verifica che WebGL sia supportato
    try {
      const canvas = document.createElement("canvas");
      const gl =
        canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) setHasError(true);
    } catch {
      setHasError(true);
    }
  }, []);

  if (hasError) {
    return (
      <div
        className="flex items-center justify-center bg-slate-900/60 border border-slate-800 rounded-2xl"
        style={{ height: props.height ?? "500px" }}
      >
        <div className="text-center p-8">
          <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🌍</span>
          </div>
          <p className="text-slate-400 text-sm">
            WebGL non è supportato dal tuo browser.
          </p>
          <p className="text-slate-500 text-xs mt-1">
            Prova con un browser più recente.
          </p>
        </div>
      </div>
    );
  }

  return <Globe {...props} />;
}
