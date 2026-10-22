// ============================================================
// MondoGioco — Compatibilità: dataset curato "piatto"
// ============================================================
// Storicamente questo file conteneva l'intero dataset dei luoghi (133
// record). Con il sistema di contenuti il dataset è organizzato in
// pacchetti versionati (`data/content/packs/**`), così qui resta solo una
// vista di compatibilità: i luoghi CURATI, cioè quelli con indizi
// originali scritti a mano e revisione umana.
//
// Per partite con filtri, mappe tematiche e pacchetti di sfida si usa il
// registro dei contenuti (`lib/content/registry.ts`), che carica on demand
// anche i pacchetti generati (città e capitali).
//
// I luoghi generati NON sono inclusi qui: sono migliaia e verrebbero
// scaricati dal browser anche quando non servono.

import type { GameLocation } from "@/types";
import { categoryLabel as labelFromRegistry } from "@/lib/content/categories";
import { hydrateCuratedRow } from "@/lib/content/hydrate";
import type { Continent } from "@/types";
import curatedCore from "./content/packs/curated-core";
import curatedMountains from "./content/packs/curated-mountains";
import curatedHydro from "./content/packs/curated-hydro";
import curatedHistoric from "./content/packs/curated-historic";
import curatedLandmarks from "./content/packs/curated-landmarks";

const CURATED_PACKS = [
  curatedCore,
  curatedMountains,
  curatedHydro,
  curatedHistoric,
  curatedLandmarks,
];

/** Tutti i luoghi curati, già idratati (contratto `GameLocation`). */
export const LOCATIONS: GameLocation[] = CURATED_PACKS.flatMap((pack) =>
  pack.rows.map((row) => hydrateCuratedRow(row, pack.id, pack.sourceId))
);

const BY_ID = new Map(LOCATIONS.map((location) => [location.id, location]));

export function getLocationById(id: string): GameLocation | undefined {
  return BY_ID.get(id);
}

export function getLocationsByContinent(continent: Continent): GameLocation[] {
  return LOCATIONS.filter((location) => location.continent === continent);
}

export function getLocationsByCategory(category: string): GameLocation[] {
  return LOCATIONS.filter((location) => location.category === category);
}

/**
 * Etichetta italiana della categoria: delegata al registro, così le nuove
 * categorie introdotte dai pacchetti funzionano senza modifiche qui.
 */
export function categoryLabel(category: string): string {
  return labelFromRegistry(category);
}
