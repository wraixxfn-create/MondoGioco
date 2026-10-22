"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { loadLocalPlayer } from "@/lib/services/player-store";

// Carica il globo solo lato client per evitare problemi SSR con Three.js
const GlobeContainer = dynamic(
  () => import("@/components/globe/Globe").then((mod) => mod.GlobeContainer),
  { ssr: false, loading: () => <GlobeLoading /> }
);

function GlobeLoading() {
  return (
    <div className="w-full h-[500px] flex items-center justify-center bg-slate-900/30 rounded-2xl border border-slate-800">
      <div className="text-center">
        <div className="relative w-20 h-20 mx-auto mb-4">
          <div className="absolute inset-0 rounded-full border-4 border-slate-800" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-500 animate-spin" />
          <span className="absolute inset-0 flex items-center justify-center text-3xl">🌍</span>
        </div>
        <p className="text-slate-400 text-sm">Caricamento globo 3D...</p>
      </div>
    </div>
  );
}

export function GlobeHero() {
  // La rotazione è puramente decorativa: si spegne con l'impostazione utente
  // (profilo → Impostazioni) o con prefers-reduced-motion, riducendo anche
  // il lavoro continuo della GPU. Il canvas è già limitato (dpr ≤ 1.8,
  // caricamento solo lato client) per non pesare sui dispositivi lenti.
  const [autoRotate, setAutoRotate] = useState(true);
  useEffect(() => {
    try {
      const { settings } = loadLocalPlayer();
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setAutoRotate(settings.globeAutoRotate && !settings.reduceMotion && !prefersReduced);
    } catch {
      // Preferenze non leggibili: comportamento predefinito invariato.
    }
  }, []);

  return (
    <GlobeContainer
      autoRotate={autoRotate}
      selectable={false}
      height="500px"
      markers={[
        { id: "rome", lat: 41.9, lng: 12.5, label: "Roma", color: "#10b981" },
        { id: "tokyo", lat: 35.68, lng: 139.69, label: "Tokyo", color: "#06b6d4" },
        { id: "ny", lat: 40.71, lng: -74.01, label: "New York", color: "#8b5cf6" },
        { id: "sydney", lat: -33.87, lng: 151.21, label: "Sydney", color: "#f59e0b" },
        { id: "cairo", lat: 30.04, lng: 31.24, label: "Il Cairo", color: "#ef4444" },
      ]}
    />
  );
}
