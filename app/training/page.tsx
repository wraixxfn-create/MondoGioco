"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { COUNTRIES } from "@/data/countries";
import { continentLabel, formatNumber } from "@/lib/utils";
import type { Country, Continent } from "@/types";

export default function TrainingPage() {
  const [selectedContinent, setSelectedContinent] = useState<Continent | "all">("all");
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCountries = COUNTRIES.filter((country) => {
    const matchesContinent =
      selectedContinent === "all" || country.continent === selectedContinent;
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
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2">Allenamento</h1>
        <p className="text-slate-400">
          Studia i paesi del mondo senza pressione. Nessun timer, nessun punteggio.
        </p>
      </div>

      {/* Filtri */}
      <div className="space-y-4">
        {/* Ricerca */}
        <div className="relative max-w-md mx-auto">
          <input
            type="text"
            placeholder="Cerca paese o capitale..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
          <svg
            className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500"
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

        {/* Continenti */}
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

      {/* Dettaglio Paese */}
      {selectedCountry && (
        <Card className="max-w-2xl mx-auto">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <span className="text-5xl">{selectedCountry.flag}</span>
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {selectedCountry.name}
                </h2>
                <p className="text-slate-400">
                  Capitale: {selectedCountry.capital}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelectedCountry(null)}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              aria-label="Chiudi"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-slate-500 uppercase mb-1">Continente</p>
              <p className="text-sm font-semibold text-white">
                {continentLabel(selectedCountry.continent)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase mb-1">Popolazione</p>
              <p className="text-sm font-semibold text-white">
                {formatNumber(selectedCountry.population)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase mb-1">Superficie</p>
              <p className="text-sm font-semibold text-white">
                {formatNumber(selectedCountry.area)} km²
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase mb-1">Coordinate</p>
              <p className="text-sm font-semibold text-white">
                {selectedCountry.coordinates.lat.toFixed(1)}°, {selectedCountry.coordinates.lng.toFixed(1)}°
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Lista Paesi */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCountries.map((country) => (
          <Card
            key={country.id}
            hover
            onClick={() => setSelectedCountry(country)}
            className="!p-4"
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">{country.flag}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white truncate">
                  {country.name}
                </p>
                <p className="text-sm text-slate-400 truncate">
                  {country.capital}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredCountries.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-400">Nessun paese trovato</p>
        </div>
      )}
    </div>
  );
}
