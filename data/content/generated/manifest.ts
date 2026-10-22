// ============================================================
// manifest.ts — inventario dei pacchetti generati
// ============================================================
// FILE GENERATO da `npm run content:build` — NON MODIFICARE A MANO.
// Le correzioni si fanno nelle fonti o nello script di generazione.
//
// Fonte dati: GeoNames cities1000 (CC BY 4.0) via pacchetto npm
//   `all-the-cities` (MIT) — © GeoNames contributors.
// Geometrie di controllo: Natural Earth 1:10m (pubblico dominio) via
//   pacchetto npm `world-atlas` (ISC).
// Denominazioni: `i18n-iso-countries` (MIT) e `countries-list` (MIT).
// Generato il 2026-10-22 · versione contenuti 1.0.0.
// ============================================================
import type { ContentManifest } from "../schema";

export const GENERATED_MANIFEST: ContentManifest = {
  schemaVersion: 2,
  contentVersion: "1.0.0",
  generatedAt: "2026-10-22",
  totalLocations: 3348,
  packs: [
    {
      id: "cities-europe",
      version: "1.0.0",
      title: "Città e capitali — Europa",
      count: 619,
      approxBytes: 45926,
      sourceIds: ["geonames", "natural-earth", "iso-3166"],
      curated: false,
    },
    {
      id: "cities-asia",
      version: "1.0.0",
      title: "Città e capitali — Asia",
      count: 1157,
      approxBytes: 85786,
      sourceIds: ["geonames", "natural-earth", "iso-3166"],
      curated: false,
    },
    {
      id: "cities-africa",
      version: "1.0.0",
      title: "Città e capitali — Africa",
      count: 727,
      approxBytes: 53141,
      sourceIds: ["geonames", "natural-earth", "iso-3166"],
      curated: false,
    },
    {
      id: "cities-north_america",
      version: "1.0.0",
      title: "Città e capitali — America del Nord",
      count: 436,
      approxBytes: 34327,
      sourceIds: ["geonames", "natural-earth", "iso-3166"],
      curated: false,
    },
    {
      id: "cities-south_america",
      version: "1.0.0",
      title: "Città e capitali — America del Sud",
      count: 279,
      approxBytes: 22332,
      sourceIds: ["geonames", "natural-earth", "iso-3166"],
      curated: false,
    },
    {
      id: "cities-oceania",
      version: "1.0.0",
      title: "Città e capitali — Oceania",
      count: 130,
      approxBytes: 10681,
      sourceIds: ["geonames", "natural-earth", "iso-3166"],
      curated: false,
    },
  ],
};

export default GENERATED_MANIFEST;
