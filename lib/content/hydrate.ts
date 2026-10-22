// ============================================================
// MondoGioco — Idratazione dei record in luoghi di gioco
// ============================================================
// I pacchetti memorizzano record compatti (tuple): l'idratazione li
// converte in `HydratedLocation`, cioè oggetti pronti per il motore di
// gioco (`GameLocation`) con in più i metadati usati dalla selezione e
// dall'interfaccia. Gli indizi mancanti vengono generati in questo
// momento (vedi `hints.ts`): nessun testo viene scaricato due volte.

import { CURATED_GEO_AUDIT } from "@/data/content/generated/curated-audit";
import { COUNTRY_REFERENCE } from "@/data/content/generated/country-reference";
import {
  LOCATION_FLAGS,
  type CuratedRow,
  type GeoCheckResult,
  type HydratedLocation,
  type PackedRow,
  type ThemeId,
  type DifficultyLevel,
} from "@/data/content/schema";
import type { Continent } from "@/types";
import { getCategory } from "./categories";
import { buildHints, countryReference } from "./hints";

const GEO_CHECK_BY_CODE: GeoCheckResult[] = ["inside", "near", "outside", "unavailable"];
const CONTINENT_BY_ISO = new Map<string, Continent>(
  COUNTRY_REFERENCE.map((entry) => [entry.iso2, entry.continent])
);

/** Accuratezza dichiarata per le coordinate a 4 decimali (~11 m). */
const COORDINATE_ACCURACY_M = 15;

function themesFromFlags(flags: number, category: string, explicit: ThemeId[]): ThemeId[] {
  const themes = new Set<ThemeId>(explicit);
  if (flags & LOCATION_FLAGS.CAPITAL) themes.add("capitals");
  if (flags & LOCATION_FLAGS.METROPOLIS) themes.add("metropolis");
  if (flags & LOCATION_FLAGS.MEGACITY) themes.add("megacity");
  if (flags & LOCATION_FLAGS.COASTAL) themes.add("coastal");
  if (flags & LOCATION_FLAGS.ADMIN_CAPITAL) themes.add("admin-capital");
  for (const theme of getCategory(category).defaultThemes ?? []) themes.add(theme);
  return [...themes];
}

/** Idrata una riga di un pacchetto generato (città e capitali GeoNames). */
export function hydratePackedRow(row: PackedRow, packId: string): HydratedLocation {
  const [id, name, countryCode, admin1, category, difficulty, lat, lng, population, flags, check] =
    row;
  const reference = countryReference(countryCode);
  const continent = CONTINENT_BY_ISO.get(countryCode) ?? "europe";
  const themes = themesFromFlags(flags, category, []);
  const location: HydratedLocation = {
    id,
    name,
    country: reference?.nameIt ?? countryCode,
    countryCode,
    continent,
    category,
    difficulty,
    coordinates: { lat, lng },
    themes,
    sourceId: "geonames",
    population,
    hints: [],
    packId,
    quality: {
      coordinateAccuracyM: COORDINATE_ACCURACY_M,
      geoCheck: GEO_CHECK_BY_CODE[check] ?? "unavailable",
      reviewed: false,
    },
  };
  if (admin1) location.admin1 = admin1;
  location.hints = buildHints(location);
  return location;
}

/** Idrata una riga di un pacchetto curato (indizi scritti a mano). */
export function hydrateCuratedRow(
  row: CuratedRow,
  packId: string,
  sourceId: string
): HydratedLocation {
  const [id, name, country, countryCode, continent, category, difficulty, lat, lng, themes, hints] =
    row;
  const audit = CURATED_GEO_AUDIT[id];
  const location: HydratedLocation = {
    id,
    name,
    country,
    countryCode,
    continent,
    category,
    difficulty,
    coordinates: { lat, lng },
    themes: [...new Set([...themes, ...(getCategory(category).defaultThemes ?? [])])],
    sourceId,
    hints: [...hints],
    packId,
    quality: {
      coordinateAccuracyM: COORDINATE_ACCURACY_M,
      geoCheck: audit?.geoCheck ?? "unavailable",
      borderDistanceKm: audit?.borderDistanceKm,
      reviewed: true,
    },
  };
  if (location.hints.length === 0) location.hints = buildHints(location);
  return location;
}

/** Ordina per difficoltà crescente (usato dai filtri e dalle statistiche). */
export function byDifficulty(a: DifficultyLevel, b: DifficultyLevel): number {
  return a - b;
}
