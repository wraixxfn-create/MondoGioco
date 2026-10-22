// ============================================================
// MondoGioco — Catalogo: indice, faccette e filtri
// ============================================================
// Il catalogo è una struttura derivata, costruita a partire dai luoghi
// già caricati: non contiene dati propri e può essere ricostruito in
// qualunque momento. Separa la "vista" sui contenuti (faccette, conteggi,
// filtri) dalla selezione dei round (`selection.ts`) e dalle regole del
// gioco (`lib/game/engine.ts`).

import type { CategoryId, DifficultyLevel, HydratedLocation, ThemeId } from "@/data/content/schema";
import type { Continent } from "@/types";
import { getCategory, listCategories } from "@/lib/content/categories";
import { getTheme, listThemes } from "@/lib/content/themes";
import { continentLabel } from "@/lib/utils";

export interface FacetValue<T> {
  value: T;
  label: string;
  count: number;
}

export interface ContentFacets {
  continents: FacetValue<Continent>[];
  countries: FacetValue<string>[];
  categories: FacetValue<CategoryId>[];
  themes: FacetValue<ThemeId>[];
  difficulties: FacetValue<DifficultyLevel>[];
  packs: FacetValue<string>[];
}

export interface ContentIndex {
  locations: HydratedLocation[];
  byId: Map<string, HydratedLocation>;
  facets: ContentFacets;
}

/** Criteri di filtro esprimibili dall'interfaccia. */
export interface FilterCriteria {
  continents?: Continent[];
  /** Codici ISO 3166-1 alpha-2. */
  countries?: string[];
  categories?: CategoryId[];
  themes?: ThemeId[];
  difficulties?: DifficultyLevel[];
  /** Id dei pacchetti da considerare. */
  packs?: string[];
  /** Ricerca testuale (case-insensitive) su nome e paese. */
  search?: string;
}

function countBy<T extends string | number>(
  locations: HydratedLocation[],
  keyOf: (location: HydratedLocation) => T[],
  labelOf: (value: T) => string
): FacetValue<T>[] {
  const counts = new Map<T, number>();
  for (const location of locations) {
    for (const key of keyOf(location)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: labelOf(value), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "it"));
}

/** Costruisce l'indice (e le faccette) a partire dai luoghi caricati. */
export function buildIndex(locations: HydratedLocation[]): ContentIndex {
  return {
    locations,
    byId: new Map(locations.map((location) => [location.id, location])),
    facets: {
      continents: countBy(
        locations,
        (l) => [l.continent],
        (value) => continentLabel(value)
      ),
      countries: countBy(
        locations,
        (l) => [l.countryCode],
        (value) => locations.find((l) => l.countryCode === value)?.country ?? value
      ),
      categories: countBy(
        locations,
        (l) => [l.category],
        (value) => getCategory(value).label
      ),
      themes: countBy(
        locations,
        (l) => l.themes,
        (value) => getTheme(value).label
      ),
      difficulties: countBy<DifficultyLevel>(
        locations,
        (l) => [l.difficulty],
        (value) => `Livello ${value}`
      ).sort((a, b) => a.value - b.value),
      packs: countBy(
        locations,
        (l) => [l.packId],
        (value) => value
      ),
    },
  };
}

/** True se il luogo soddisfa tutti i criteri indicati. */
export function matchesCriteria(location: HydratedLocation, criteria: FilterCriteria): boolean {
  if (criteria.continents?.length && !criteria.continents.includes(location.continent)) {
    return false;
  }
  if (criteria.countries?.length) {
    const codes = location.countryCode.split(";");
    if (!criteria.countries.some((code) => codes.includes(code))) return false;
  }
  if (criteria.categories?.length && !criteria.categories.includes(location.category)) {
    return false;
  }
  if (
    criteria.themes?.length &&
    !criteria.themes.some((theme) => location.themes.includes(theme))
  ) {
    return false;
  }
  if (criteria.difficulties?.length && !criteria.difficulties.includes(location.difficulty)) {
    return false;
  }
  if (criteria.packs?.length && !criteria.packs.includes(location.packId)) return false;
  if (criteria.search) {
    const needle = criteria.search.trim().toLowerCase();
    if (needle.length > 0) {
      const haystack =
        `${location.name} ${location.country} ${location.admin1 ?? ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
  }
  return true;
}

/** Applica i filtri a un indice. */
export function selectLocations(
  index: ContentIndex,
  criteria: FilterCriteria = {}
): HydratedLocation[] {
  return index.locations.filter((location) => matchesCriteria(location, criteria));
}

/**
 * Quanti round distinti sono disponibili con questi criteri, escludendo
 * i luoghi già visti: serve all'interfaccia per segnalare filtri troppo
 * restrittivi prima di avviare la partita.
 */
export function countAvailable(
  index: ContentIndex,
  criteria: FilterCriteria = {},
  exclude?: Set<string>
): number {
  let count = 0;
  for (const location of index.locations) {
    if (exclude?.has(location.id)) continue;
    if (matchesCriteria(location, criteria)) count++;
  }
  return count;
}

/** Categorie presenti nell'indice, con etichette pronte per la UI. */
export function categoriesIn(index: ContentIndex): FacetValue<CategoryId>[] {
  const counts = new Map<CategoryId, number>();
  for (const location of index.locations) {
    counts.set(location.category, (counts.get(location.category) ?? 0) + 1);
  }
  return listCategories()
    .filter((category) => counts.has(category.id))
    .map((category) => ({
      value: category.id,
      label: category.label,
      count: counts.get(category.id) ?? 0,
    }));
}

/** Temi presenti nell'indice, con etichette pronte per la UI. */
export function themesIn(index: ContentIndex): FacetValue<ThemeId>[] {
  const counts = new Map<ThemeId, number>();
  for (const location of index.locations) {
    for (const theme of location.themes) counts.set(theme, (counts.get(theme) ?? 0) + 1);
  }
  return listThemes()
    .filter((theme) => counts.has(theme.id))
    .map((theme) => ({ value: theme.id, label: theme.label, count: counts.get(theme.id) ?? 0 }));
}
