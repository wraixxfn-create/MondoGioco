"use client";
"use no memo";

import React, {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, Line, Stars } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import {
  latLngToVector3,
  vector3ToLatLng,
  greatCircleArcPoints,
} from "@/lib/game/geo";
import type { GeoCoordinates } from "@/types";

// ============================================================
// Globe — Globo terrestre 3D geograficamente accurato
// ============================================================
//
// Texture: "Blue Marble" NASA Visible Earth (pubblico dominio),
// equirettangolare 4096×2048, servita da /textures/earth-day-4096.jpg
// (+ normal map per il rilievo). In caso di errore di caricamento
// si passa a una sfera con solo graticcio lat/lng — dichiarata
// onestamente nella UI, mai spacciata per una mappa.
//
// Picking: il click/tap viene intercettato da React Three Fiber
// (raycasting). Il punto 3D dell'intersezione è convertito in
// latitudine/longitudine con `vector3ToLatLng` (geo.ts), l'inversa
// esatta della proiezione usata per i marker: i test unitari ne
// verificano il round-trip su tutto il dataset. La sfera non ruota
// mai (si muove solo la camera con OrbitControls), quindi il punto
// world coincide con il punto locale sulla sfera unitaria.

const EARTH_TEXTURE_URL = "/textures/earth-day-4096.jpg";
const EARTH_NORMAL_URL = "/textures/earth-normal-2048.jpg";
const INITIAL_FOCUS: GeoCoordinates = { lat: 24, lng: 14 };
const INITIAL_DISTANCE = 3.2;
const MIN_DISTANCE = 1.7;
const MAX_DISTANCE = 5.5;

export interface GlobeMarker {
  id: string;
  lat: number;
  lng: number;
  color?: string;
  label?: string;
  size?: number;
}

export interface GlobeProps {
  /** Callback di selezione di un punto sul globo (coordinate reali). */
  onPick?: (coords: GeoCoordinates) => void;
  /** @deprecated Alias legacy di onPick. */
  onGlobeClick?: (lat: number, lng: number) => void;
  /** Punto scelto dal giocatore (marker azzurro). */
  guessCoords?: GeoCoordinates | null;
  /** Destinazione corretta, mostrata al reveal (marker ambra). */
  targetCoords?: GeoCoordinates | null;
  /** Etichetta della destinazione al reveal. */
  targetLabel?: string;
  /** @deprecated Alias legacy di targetCoords. */
  highlightCoords?: GeoCoordinates | null;
  /** Marker generici (es. hero della homepage). */
  markers?: GlobeMarker[];
  /** Se true, click/tap selezionano un punto. */
  selectable?: boolean;
  /** Rotazione automatica (disattiva quando selectable). */
  autoRotate?: boolean;
  /** Altezza del contenitore (default 500px). */
  height?: string;
  /** Quando cambia, la camera si anima verso queste coordinate. */
  focusCoords?: GeoCoordinates | null;
}

type TextureStatus = "loading" | "ready" | "error";

interface CameraBus {
  requestFocus?: (coords: GeoCoordinates, durationSec?: number) => void;
  zoomBy?: (factor: number) => void;
  reset?: () => void;
  getFacingCoords?: () => GeoCoordinates;
}

export function Globe({
  onPick,
  onGlobeClick,
  guessCoords,
  targetCoords,
  targetLabel,
  highlightCoords,
  markers = [],
  selectable = false,
  autoRotate = true,
  height = "500px",
  focusCoords,
}: GlobeProps) {
  const [textureStatus, setTextureStatus] = useState<TextureStatus>("loading");
  const [earthTexture, setEarthTexture] = useState<THREE.Texture | null>(null);
  const [normalTexture, setNormalTexture] = useState<THREE.Texture | null>(null);
  const [hoverCoords, setHoverCoords] = useState<GeoCoordinates | null>(null);
  const [kbCursor, setKbCursor] = useState<GeoCoordinates | null>(null);
  const [kbActive, setKbActive] = useState(false);
  const cameraBusRef = useRef<CameraBus>({});
  const lastHoverAt = useRef(0);

  const effectiveTarget = targetCoords ?? highlightCoords ?? null;

  // ---- Caricamento texture con gestione esplicita degli errori ----
  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load(
      EARTH_TEXTURE_URL,
      (tex) => {
        if (cancelled) return;
        tex.colorSpace = THREE.SRGBColorSpace;
        setEarthTexture(tex);
        setTextureStatus("ready");
      },
      undefined,
      () => {
        if (!cancelled) setTextureStatus("error");
      }
    );
    loader.load(
      EARTH_NORMAL_URL,
      (tex) => {
        if (!cancelled) setNormalTexture(tex);
      },
      undefined,
      () => {
        /* la normal map è un abbellimento: il suo fallimento è silenzioso */
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      earthTexture?.dispose();
      normalTexture?.dispose();
    };
  }, [earthTexture, normalTexture]);

  const handlePick = useCallback(
    (coords: GeoCoordinates) => {
      if (!selectable) return;
      setKbCursor(null);
      onPick?.(coords);
      onGlobeClick?.(coords.lat, coords.lng);
    },
    [selectable, onPick, onGlobeClick]
  );

  const handleHover = useCallback(
    (coords: GeoCoordinates | null) => {
      const now = performance.now();
      if (coords && now - lastHoverAt.current < 60) return;
      lastHoverAt.current = now;
      setHoverCoords(coords);
    },
    []
  );

  // ---- Controllo da tastiera: reticolo mobile accessibile ----
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!selectable) return;
      const step = e.shiftKey ? 0.25 : 2;
      const initCursor =
        kbCursor ??
        guessCoords ??
        cameraBusRef.current.getFacingCoords?.() ??
        INITIAL_FOCUS;

      let next: GeoCoordinates | null = null;
      switch (e.key) {
        case "ArrowUp":
          next = { lat: Math.min(85, initCursor.lat + step), lng: initCursor.lng };
          break;
        case "ArrowDown":
          next = { lat: Math.max(-85, initCursor.lat - step), lng: initCursor.lng };
          break;
        case "ArrowLeft":
          next = { lat: initCursor.lat, lng: initCursor.lng - step };
          break;
        case "ArrowRight":
          next = { lat: initCursor.lat, lng: initCursor.lng + step };
          break;
        case "Enter":
        case " ":
          if (kbCursor) {
            e.preventDefault();
            handlePick(kbCursor);
          }
          return;
        case "+":
        case "=":
          cameraBusRef.current.zoomBy?.(0.8);
          return;
        case "-":
          cameraBusRef.current.zoomBy?.(1.25);
          return;
        default:
          return;
      }
      e.preventDefault();
      setKbActive(true);
      setKbCursor(next);
      cameraBusRef.current.requestFocus?.(next, 0.35);
    },
    [selectable, kbCursor, guessCoords, handlePick]
  );

  const formatCoords = (c: GeoCoordinates) =>
    `${Math.abs(c.lat).toFixed(2)}° ${c.lat >= 0 ? "N" : "S"}, ${Math.abs(c.lng).toFixed(2)}° ${c.lng >= 0 ? "E" : "O"}`;

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden border border-slate-800 bg-[#020617] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      style={{ height, cursor: selectable ? "crosshair" : "grab", touchAction: "none" }}
      tabIndex={selectable ? 0 : -1}
      role={selectable ? "application" : undefined}
      aria-label={
        selectable
          ? "Globo terrestre interattivo. Trascina per ruotare, tocca o clicca per posizionare la puntina. Con la tastiera: frecce per spostare il mirino, Invio per confermare la posizione, più e meno per lo zoom."
          : "Globo terrestre 3D"
      }
      onKeyDown={handleKeyDown}
      onFocus={() => selectable && setKbActive(true)}
      data-testid="globe-container"
    >
      <Canvas
        camera={{
          position: latLngToVector3(INITIAL_FOCUS.lat, INITIAL_FOCUS.lng, INITIAL_DISTANCE),
          fov: 42,
          near: 0.1,
          far: 200,
        }}
        dpr={[1, 1.8]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={1.15} />
        <directionalLight position={[5, 2.5, 4]} intensity={1.6} />
        <directionalLight position={[-6, -2, -4]} intensity={0.25} color="#7dd3fc" />

        <Stars radius={90} depth={30} count={2200} factor={3.2} saturation={0} fade speed={0.6} />

        <EarthMesh
          texture={earthTexture}
          normalTexture={normalTexture}
          textureFailed={textureStatus === "error"}
          selectable={selectable}
          onPick={handlePick}
          onHover={handleHover}
        />

        {/* Alone atmosferico */}
        <mesh scale={[1.14, 1.14, 1.14]}>
          <sphereGeometry args={[1, 48, 48]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.07} side={THREE.BackSide} depthWrite={false} />
        </mesh>

        {markers.map((m) => (
          <SurfaceMarker key={m.id} coords={{ lat: m.lat, lng: m.lng }} color={m.color ?? "#10b981"} label={m.label} size={m.size} />
        ))}

        {kbCursor && selectable && (
          <SurfaceMarker coords={kbCursor} color="#ffffff" size={0.022} ringOnly />
        )}

        {guessCoords && (
          <SurfaceMarker coords={guessCoords} color="#22d3ee" size={0.03} label="La tua risposta" />
        )}

        {effectiveTarget && (
          <SurfaceMarker coords={effectiveTarget} color="#fbbf24" size={0.034} label={targetLabel} pulse />
        )}

        {guessCoords && effectiveTarget && (
          <GuessArc from={guessCoords} to={effectiveTarget} />
        )}

        <CameraRig
          bus={cameraBusRef}
          autoRotate={autoRotate && !selectable}
          focusCoords={focusCoords ?? null}
        />
      </Canvas>

      {/* ---- Overlay UI ---- */}
      {textureStatus === "loading" && (
        <div className="absolute top-3 left-3 flex items-center gap-2 bg-slate-900/85 border border-slate-700 rounded-full px-3 py-1.5 text-xs text-slate-300 pointer-events-none">
          <span className="w-3 h-3 rounded-full border-2 border-slate-600 border-t-emerald-400 animate-spin" />
          Caricamento texture terrestre…
        </div>
      )}

      {textureStatus === "error" && (
        <div
          role="alert"
          className="absolute top-3 left-3 right-3 sm:right-auto bg-amber-500/15 border border-amber-500/50 text-amber-200 rounded-xl px-3 py-2 text-xs pointer-events-none"
        >
          ⚠️ Texture della Terra non disponibile: visualizzazione semplificata
          con griglia latitudine/longitudine. La selezione resta precisa.
        </div>
      )}

      {textureStatus === "ready" && (
        <div className="absolute bottom-2 right-3 text-[10px] text-slate-500 pointer-events-none">
          Texture: NASA Blue Marble — Visible Earth (pubblico dominio)
        </div>
      )}

      {selectable && (hoverCoords || kbCursor) && (
        <div className="absolute bottom-2 left-3 bg-slate-900/85 border border-slate-700 rounded-full px-3 py-1.5 text-xs text-cyan-200 pointer-events-none tabular-nums">
          📍 {formatCoords(kbCursor ?? hoverCoords!)}
          {kbCursor && kbActive ? " · Invio per puntare qui" : ""}
        </div>
      )}

      {/* Pulsanti zoom/vista: usabili anche da touch e screen reader */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5">
        <button
          type="button"
          aria-label="Avvicina (zoom +)"
          onClick={() => cameraBusRef.current.zoomBy?.(0.75)}
          className="w-10 h-10 rounded-xl bg-slate-900/85 border border-slate-700 text-white text-lg leading-none hover:border-emerald-500 active:scale-95 transition"
        >
          +
        </button>
        <button
          type="button"
          aria-label="Allontana (zoom −)"
          onClick={() => cameraBusRef.current.zoomBy?.(1.33)}
          className="w-10 h-10 rounded-xl bg-slate-900/85 border border-slate-700 text-white text-lg leading-none hover:border-emerald-500 active:scale-95 transition"
        >
          −
        </button>
        <button
          type="button"
          aria-label="Ripristina la vista iniziale"
          onClick={() => cameraBusRef.current.reset?.()}
          className="w-10 h-10 rounded-xl bg-slate-900/85 border border-slate-700 text-white text-base leading-none hover:border-emerald-500 active:scale-95 transition"
        >
          ⌖
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Sfera terrestre con picking
// ============================================================

interface EarthMeshProps {
  texture: THREE.Texture | null;
  normalTexture: THREE.Texture | null;
  textureFailed: boolean;
  selectable: boolean;
  onPick: (coords: GeoCoordinates) => void;
  onHover: (coords: GeoCoordinates | null) => void;
}

function EarthMesh({
  texture,
  normalTexture,
  textureFailed,
  selectable,
  onPick,
  onHover,
}: EarthMeshProps) {
  const { gl, size } = useThree();

  // Texture di riserva: solo graticcio, nessun continente inventato.
  const graticuleTexture = useMemo(() => {
    if (!textureFailed || typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0a3d62";
    ctx.fillRect(0, 0, 1024, 512);
    ctx.strokeStyle = "rgba(125, 211, 252, 0.5)";
    ctx.lineWidth = 1;
    for (let lat = -80; lat <= 80; lat += 10) {
      const y = ((90 - lat) / 180) * 512;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1024, y);
      ctx.stroke();
    }
    for (let lng = -180; lng < 180; lng += 10) {
      const x = ((lng + 180) / 360) * 1024;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
    // Equatore in evidenza
    ctx.strokeStyle = "rgba(251, 191, 36, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 256);
    ctx.lineTo(1024, 256);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [textureFailed]);

  useEffect(() => {
    if (texture) {
      texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
      texture.needsUpdate = true;
    }
  }, [texture, gl]);

  useEffect(() => () => graticuleTexture?.dispose(), [graticuleTexture]);

  // Meno segmenti su schermi piccoli: il globo resta fluido
  // anche su GPU integrate/telefoni datati.
  const segments = size.width < 640 ? 48 : 64;

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!selectable) return;
      // e.delta = distanza in px tra pointerdown e pointerup:
      // sopra ~6px è un trascinamento per ruotare, non una selezione.
      if (e.delta > 6) return;
      e.stopPropagation();
      onPick(vector3ToLatLng(e.point));
    },
    [selectable, onPick]
  );

  const handleMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!selectable || e.nativeEvent.pointerType === "touch") return;
      onHover(vector3ToLatLng(e.point));
    },
    [selectable, onHover]
  );

  const activeMap = texture ?? graticuleTexture ?? undefined;

  return (
    <mesh
      onClick={handleClick}
      onPointerMove={handleMove}
      onPointerOut={() => onHover(null)}
    >
      <sphereGeometry args={[1, segments, segments]} />
      <meshStandardMaterial
        map={activeMap}
        normalMap={texture ? normalTexture ?? undefined : undefined}
        normalScale={new THREE.Vector2(0.6, 0.6)}
        color={activeMap ? "#ffffff" : "#0a3d62"}
        roughness={0.85}
        metalness={0}
      />
    </mesh>
  );
}

// ============================================================
// Marker ancorato alla superficie (orientato lungo la normale)
// ============================================================

function SurfaceMarker({
  coords,
  color,
  label,
  size = 0.026,
  pulse = false,
  ringOnly = false,
}: {
  coords: GeoCoordinates;
  color: string;
  label?: string;
  size?: number;
  pulse?: boolean;
  ringOnly?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  const { position, quaternion } = useMemo(() => {
    const pos = new THREE.Vector3(...latLngToVector3(coords.lat, coords.lng, 1.004));
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      pos.clone().normalize()
    );
    return { position: pos, quaternion: quat };
  }, [coords.lat, coords.lng]);

  useFrame((state) => {
    if (ringRef.current) {
      const base = pulse ? 1 + Math.sin(state.clock.elapsedTime * 3.5) * 0.25 : 1;
      ringRef.current.scale.setScalar(base);
    }
  });

  return (
    <group ref={groupRef} position={position} quaternion={quaternion}>
      {!ringOnly && (
        <>
          <mesh>
            <sphereGeometry args={[size, 20, 20]} />
            <meshBasicMaterial color={color} />
          </mesh>
          <mesh>
            <sphereGeometry args={[size * 2.1, 20, 20]} />
            <meshBasicMaterial color={color} transparent opacity={0.18} depthWrite={false} />
          </mesh>
        </>
      )}
      <mesh ref={ringRef} position={[0, 0, 0.002]}>
        <ringGeometry args={[size * 1.7, size * 2.1, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {label && (
        <Html position={[0, 0, size * 3.4]} center distanceFactor={7} occlude="raycast" zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <div className="bg-slate-900/90 border border-slate-600 rounded-lg px-2 py-0.5 text-[11px] font-medium text-white whitespace-nowrap shadow-lg">
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

// ============================================================
// Arco di cerchio massimo risposta → destinazione
// ============================================================

function GuessArc({ from, to }: { from: GeoCoordinates; to: GeoCoordinates }) {
  const points = useMemo(
    () => greatCircleArcPoints(from, to, 64, 1.006),
    [from, to]
  );
  if (points.length < 2) return null;
  return (
    <Line
      points={points}
      color="#f59e0b"
      lineWidth={2.2}
      transparent
      opacity={0.95}
      dashed={false}
    />
  );
}

// ============================================================
// Camera: OrbitControls + animazione di focus programmabile
// ============================================================

function CameraRig({
  bus,
  autoRotate,
  focusCoords,
}: {
  bus: React.MutableRefObject<CameraBus>;
  autoRotate: boolean;
  focusCoords: GeoCoordinates | null;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const animRef = useRef<{
    from: THREE.Vector3;
    to: THREE.Vector3;
    t: number;
    duration: number;
  } | null>(null);

  const animateTo = useCallback(
    (coords: GeoCoordinates, durationSec = 1.1, distance?: number) => {
      const dist =
        distance ??
        Math.min(MAX_DISTANCE, Math.max(2.1, camera.position.length()));
      animRef.current = {
        from: camera.position.clone(),
        to: new THREE.Vector3(...latLngToVector3(coords.lat, coords.lng, dist)),
        t: 0,
        duration: durationSec,
      };
      if (controlsRef.current) controlsRef.current.enabled = false;
    },
    [camera]
  );

  useEffect(() => {
    bus.current.requestFocus = (coords, durationSec = 1.1) =>
      animateTo(coords, durationSec);
    bus.current.zoomBy = (factor) => {
      const current = camera.position.length();
      const next = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, current * factor));
      camera.position.setLength(next);
      controlsRef.current?.update();
    };
    bus.current.reset = () => animateTo(INITIAL_FOCUS, 0.9, INITIAL_DISTANCE);
    bus.current.getFacingCoords = () => vector3ToLatLng(camera.position);
  }, [bus, camera, animateTo]);

  useEffect(() => {
    if (focusCoords) animateTo(focusCoords, 1.2);
  }, [focusCoords, animateTo]);

  useFrame((_, delta) => {
    const anim = animRef.current;
    if (!anim) return;
    anim.t = Math.min(1, anim.t + delta / anim.duration);
    // easeInOutCubic
    const e =
      anim.t < 0.5
        ? 4 * anim.t * anim.t * anim.t
        : 1 - Math.pow(-2 * anim.t + 2, 3) / 2;
    // Slerp direzionale + interpolazione del raggio
    const fromDir = anim.from.clone().normalize();
    const toDir = anim.to.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(fromDir, toDir);
    const partial = new THREE.Quaternion();
    partial.slerp(q, e);
    const dir = fromDir.clone().applyQuaternion(partial);
    const radius = THREE.MathUtils.lerp(anim.from.length(), anim.to.length(), e);
    camera.position.copy(dir.multiplyScalar(radius));
    camera.lookAt(0, 0, 0);
    if (anim.t >= 1) {
      animRef.current = null;
      if (controlsRef.current) controlsRef.current.enabled = true;
      controlsRef.current?.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.55}
      zoomSpeed={0.8}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      autoRotate={autoRotate}
      autoRotateSpeed={0.55}
    />
  );
}

// ============================================================
// Container con verifica WebGL ed error boundary (export pubblico)
// ============================================================

class GlobeErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export function GlobeContainer(props: GlobeProps) {
  const [webglOk, setWebglOk] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      setWebglOk(Boolean(gl));
    } catch {
      setWebglOk(false);
    }
  }, []);

  const fallback = (
    <div
      className="flex items-center justify-center bg-slate-900/60 border border-slate-800 rounded-2xl"
      style={{ height: props.height ?? "500px" }}
      role="alert"
    >
      <div className="text-center p-8 max-w-sm">
        <div className="text-5xl mb-4">🌍</div>
        <p className="text-slate-300 text-sm font-medium">
          Il globo 3D non può essere avviato su questo dispositivo
          (WebGL non disponibile).
        </p>
        <p className="text-slate-500 text-xs mt-2">
          Puoi comunque giocare inserendo le coordinate a mano dal pannello
          di risposta, oppure prova un browser più recente.
        </p>
      </div>
    </div>
  );

  if (webglOk === false) return fallback;

  return (
    <GlobeErrorBoundary fallback={fallback}>
      <Globe {...props} />
    </GlobeErrorBoundary>
  );
}
