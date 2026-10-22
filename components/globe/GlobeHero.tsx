"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { loadLocalPlayer } from "@/lib/services/player-store";

const GlobeContainer = dynamic(
  () => import("@/components/globe/Globe").then((mod) => mod.GlobeContainer),
  { ssr: false, loading: () => <GlobeLoading /> }
);

function GlobeLoading() {
  return (
    <div className="w-full h-full min-h-[360px] flex items-center justify-center bg-[#02061a]/40 rounded-[1.5rem] border border-white/10">
      <div className="text-center">
        <div className="relative w-20 h-20 mx-auto mb-4">
          <div className="absolute inset-0 rounded-full border-4 border-white/10" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#00d9a5] animate-spin" />
          <span className="absolute inset-0 flex items-center justify-center text-3xl">🌍</span>
        </div>
        <p className="text-white/60 text-sm font-medium">Caricamento globo 3D…</p>
        <p className="text-white/30 text-xs">Texture NASA Blue Marble</p>
      </div>
    </div>
  );
}

export function GlobeHero() {
  const [autoRotate, setAutoRotate] = useState(true);
  useEffect(() => {
    try {
      const { settings } = loadLocalPlayer();
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setAutoRotate(settings.globeAutoRotate && !settings.reduceMotion && !prefersReduced);
    } catch {}
  }, []);

  return (
    <GlobeContainer
      autoRotate={autoRotate}
      selectable={false}
      height="100%"
      markers={[
        { id: "rome", lat: 41.9, lng: 12.5, label: "Roma", color: "#00d9a5" },
        { id: "tokyo", lat: 35.68, lng: 139.69, label: "Tokyo", color: "#38bdf8" },
        { id: "ny", lat: 40.71, lng: -74.01, label: "New York", color: "#a78bfa" },
        { id: "sydney", lat: -33.87, lng: 151.21, label: "Sydney", color: "#f59e0b" },
        { id: "cairo", lat: 30.04, lng: 31.24, label: "Il Cairo", color: "#f43f5e" },
        { id: "rio", lat: -22.9, lng: -43.2, label: "Rio", color: "#10b981" },
      ]}
    />
  );
}
