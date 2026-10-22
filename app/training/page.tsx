"use client";

import React, { useState } from "react";
import { Card, Pill } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { COUNTRIES } from "@/data/countries";
import { continentLabel, formatNumber } from "@/lib/utils";
import type { Country, Continent } from "@/types";
import Link from "next/link";

export default function TrainingPage() {
  const [selectedContinent, setSelectedContinent] = useState<Continent | "all">("all");
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCountries = COUNTRIES.filter((country) => {
    const matchesContinent = selectedContinent === "all" || country.continent === selectedContinent;
    const matchesSearch =
      country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      country.capital.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesContinent && matchesSearch;
  });

  const continents: { value: Continent | "all"; label: string }[] = [
    { value: "all", label: "Tutti" },
    { value: "europe", label: "Europa" },
    { value: "asia", label: "Asia" },
    { value: "africa", label: "Africa" },
    { value: "north_america", label: "Nord America" },
    { value: "south_america", label: "Sud America" },
    { value: "oceania", label: "Oceania" },
  ];

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#16244d]/80 to-[#0f1a33]/90 backdrop-blur-xl p-6 md:p-8">
        <div className="absolute -top-16 -right-16 w-72 h-72 bg-sky-400/10 rounded-full blur-3xl" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white text-[#0a1433] text-xs font-black tracking-widest">
            📚 MODALITÀ STUDIO
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-white mt-3">Allenamento</h1>
          <p className="text-white/60 max-w-2xl mt-2 leading-relaxed">
            Esplora senza pressione. Filtra per continente, studia schede dettaglio e poi mettiti
            alla prova in{" "}
            <Link
              href="/play"
              className="text-emerald-300 underline underline-offset-4 font-semibold"
            >
              Gioca →
            </Link>
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <div className="px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-xs font-semibold text-white/70">
              🎯 Capitali • bandiere • popolazione
            </div>
            <div className="px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-xs font-semibold text-white/70">
              🌍 {COUNTRIES.length} paesi reali
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid sm:grid-cols-3 gap-3">
        {[
          { icon: "🧭", title: "Allenamento libero", desc: "∞ round, nessun timer", href: "/play" },
          { icon: "🎯", title: "Precisione", desc: "Senza timer, impara", href: "/play" },
          { icon: "⚡", title: "Sprint", desc: "Prova i riflessi", href: "/play" },
        ].map((c) => (
          <Link key={c.title} href={c.href} className="group">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 hover:bg-white/[0.07] hover:border-white/15 transition-all hover:-translate-y-0.5">
              <div className="text-xl">{c.icon}</div>
              <div className="text-white font-bold mt-1">{c.title}</div>
              <div className="text-xs text-white/50">{c.desc}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Filtri */}
      <div className="space-y-4">
        <div className="relative max-w-lg mx-auto">
          <input
            type="text"
            placeholder="Cerca paese o capitale..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3.5 bg-white/[0.06] border border-white/15 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-[#00d9a5] focus:ring-2 focus:ring-[#00d9a5]/20 transition-all backdrop-blur-sm"
          />
          <svg
            className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <div className="flex flex-wrap gap-2 justify-center">
          {continents.map((continent) => (
            <Button
              key={continent.value}
              variant={selectedContinent === continent.value ? "primary" : "secondary"}
              size="sm"
              onClick={() => setSelectedContinent(continent.value)}
            >
              {continent.label}
            </Button>
          ))}
        </div>
      </div>

      {selectedCountry && (
        <Card className="max-w-2xl mx-auto border-emerald-500/20">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <span className="text-5xl">{selectedCountry.flag}</span>
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight">
                  {selectedCountry.name}
                </h2>
                <p className="text-white/60">
                  Capitale:{" "}
                  <span className="text-white font-semibold">{selectedCountry.capital}</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelectedCountry(null)}
              className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/15 transition-colors"
              aria-label="Chiudi"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { k: "Continente", v: continentLabel(selectedCountry.continent) },
              { k: "Popolazione", v: formatNumber(selectedCountry.population) },
              { k: "Superficie", v: `${formatNumber(selectedCountry.area)} km²` },
              {
                k: "Coordinate",
                v: `${selectedCountry.coordinates.lat.toFixed(1)}°, ${selectedCountry.coordinates.lng.toFixed(1)}°`,
              },
            ].map((s) => (
              <div key={s.k} className="rounded-2xl bg-white/5 border border-white/10 p-3">
                <div className="text-[11px] font-bold tracking-widest uppercase text-white/40">
                  {s.k}
                </div>
                <div className="text-sm font-bold text-white mt-1">{s.v}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Pill tone="info">{continentLabel(selectedCountry.continent)}</Pill>
            <Pill tone="neutral">{selectedCountry.capital}</Pill>
          </div>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCountries.map((country) => (
          <Card
            key={country.id}
            hover
            onClick={() => setSelectedCountry(country)}
            className="!p-4 group"
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl group-hover:scale-110 transition-transform">
                {country.flag}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white truncate">{country.name}</p>
                <p className="text-sm text-white/50 truncate">
                  {country.capital} • {continentLabel(country.continent)}
                </p>
              </div>
              <span className="w-7 h-7 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white/40 group-hover:bg-white group-hover:text-[#0a1433] transition-colors">
                →
              </span>
            </div>
          </Card>
        ))}
      </div>

      {filteredCountries.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl mb-3">
            🔍
          </div>
          <p className="text-white/60 font-medium">Nessun paese trovato</p>
          <p className="text-white/30 text-sm">Prova con un altro termine o continente</p>
        </div>
      )}
    </div>
  );
}
