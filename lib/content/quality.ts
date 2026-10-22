// ============================================================
// MondoGioco — Controlli di qualità sui contenuti
// ============================================================
// Un unico modulo di validazione usato da:
// - `tests/unit/content-data.test.ts` (blocca le regressioni in CI);
// - `scripts/build-content.mjs` (controlli in fase di generazione);
// - la schermata `/contenuti` (stato del dataset in chiaro).
//
// I controlli coprono: coordinate, duplicati, metadati, attribuzioni e
// ambiguità spaziale fra obiettivi.

import type { CategoryId, HydratedLocation, SourceId, ThemeId } from "@/data/content/schema";
import { DATA_SOURCES, getSource } from "@/data/content/sources";
import { getCategory } from "@/lib/content/categories";
import { getTheme } from "@/lib/content/themes";
import { haversineDistanceKm, isValidCoordinates } from "@/lib/game/geo";

export type QualityCode =
  | "invalid-id"
  | "duplicate-id"
  | "invalid-coordinates"
  | "missing-name"
  | "missing-country"
  | "invalid-difficulty"
  | "invalid-continent"
  | "missing-hints"
  | "short-hint"
  | "unknown-source"
  | "unknown-category"
  | "unknown-theme"
  | "duplicate-place"
  | "ambiguous-cluster"
  | "overlapping-coordinates"
  | "unchecked-geometry";

export interface QualityIssue {
  code: QualityCode;
  severity: "error" | "warning";
  locationId?: string;
  message: string;
}

export interface QualityOptions {
  /** Distanza minima fra due luoghi della stessa categoria (km). */
  minSameCategoryKm?: number;
  /** Distanza minima assoluta fra due luoghi qualsiasi (km). */
  minAnyKm?: number;
  /** Segnala come errore (anziché avviso) le categorie non registrate. */
  requireKnownCategory?: boolean;
  /** Segnala i record senza verifica geometrica (solo per i curati). */
  requireGeometryCheck?: boolean;
  /** Fonti considerate valide (default: il registro `sources.ts`). */
  knownSources?: Set<SourceId>;
}

const DEFAULT_OPTIONS: Required<QualityOptions> = {
  /**
   * 10 km: sotto questa distanza due luoghi della stessa categoria e
   * dello stesso paese sarebbero confusi dal giocatore. Le coppie di
   * paesi diversi (es. Kinshasa/Brazzaville) sono invece legittime:
   * sono luoghi distinti e il paese li distingue.
   */
  minSameCategoryKm: 10,
  /** 50 m: sotto questa soglia le coordinate sono un errore materiale. */
  minAnyKm: 0.05,
  requireKnownCategory: false,
  requireGeometryCheck: false,
  knownSources: new Set(DATA_SOURCES.map((source) => source.id)),
};

const VALID_CONTINENTS = new Set([
  "europe",
  "asia",
  "africa",
  "north_america",
  "south_america",
  "oceania",
  "antarctica",
]);

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Griglia 1° × 1° per i confronti spaziali (evita l'O(n²) su tutto il dataset). */
function spatialPairs(
  locations: HydratedLocation[],
  minSameCategoryKm: number,
  minAnyKm: number
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const cellSize = 1;
  const grid = new Map<string, HydratedLocation[]>();
  const key = (lat: number, lng: number) =>
    `${Math.floor(lat / cellSize)}:${Math.floor(lng / cellSize)}`;
  for (const location of locations) {
    const cellKey = key(location.coordinates.lat, location.coordinates.lng);
    const cell = grid.get(cellKey) ?? [];
    cell.push(location);
    grid.set(cellKey, cell);
  }

  const checked = new Set<string>();
  for (const location of locations) {
    const baseLat = Math.floor(location.coordinates.lat / cellSize);
    const baseLng = Math.floor(location.coordinates.lng / cellSize);
    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLng = -1; dLng <= 1; dLng++) {
        const cell = grid.get(`${baseLat + dLat}:${baseLng + dLng}`);
        if (!cell) continue;
        for (const other of cell) {
          if (other.id === location.id) continue;
          const pairKey =
            location.id < other.id ? `${location.id}|${other.id}` : `${other.id}|${location.id}`;
          if (checked.has(pairKey)) continue;
          checked.add(pairKey);
          const distanceKm = haversineDistanceKm(location.coordinates, other.coordinates);
          if (distanceKm < minAnyKm) {
            issues.push({
              code: "overlapping-coordinates",
              severity: "error",
              locationId: location.id,
              message: `${location.id} e ${other.id} distano ${distanceKm.toFixed(2)} km: coordinate praticamente identiche.`,
            });
          } else if (
            distanceKm < minSameCategoryKm &&
            location.category === other.category &&
            location.countryCode
              .split(";")
              .some((code) => other.countryCode.split(";").includes(code))
          ) {
            issues.push({
              code: "ambiguous-cluster",
              severity: "error",
              locationId: location.id,
              message: `${location.id} e ${other.id} sono entrambi "${location.category}" nello stesso paese e distano ${distanceKm.toFixed(1)} km (minimo ${minSameCategoryKm} km).`,
            });
          }
        }
      }
    }
  }
  return issues;
}

/**
 * Valida una collezione di luoghi. Restituisce l'elenco dei problemi:
 * vuoto significa dataset coerente.
 */
export function validateLocations(
  locations: HydratedLocation[],
  options: QualityOptions = {}
): QualityIssue[] {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const issues: QualityIssue[] = [];
  const seenIds = new Set<string>();
  const seenPlaces = new Map<string, string>();

  for (const location of locations) {
    const where = location.id || "(id mancante)";

    if (!location.id || !ID_PATTERN.test(location.id)) {
      issues.push({
        code: "invalid-id",
        severity: "error",
        locationId: where,
        message: `Id non valido: "${location.id}" (serve uno slug minuscolo, es. "monte-bianco").`,
      });
    } else if (seenIds.has(location.id)) {
      issues.push({
        code: "duplicate-id",
        severity: "error",
        locationId: where,
        message: `Id duplicato: "${location.id}".`,
      });
    }
    seenIds.add(location.id);

    if (!isValidCoordinates(location.coordinates)) {
      issues.push({
        code: "invalid-coordinates",
        severity: "error",
        locationId: where,
        message: `Coordinate fuori dai range validi: ${location.coordinates.lat}, ${location.coordinates.lng}.`,
      });
    }

    if (!location.name || location.name.trim().length < 2) {
      issues.push({
        code: "missing-name",
        severity: "error",
        locationId: where,
        message: "Nome mancante o troppo corto.",
      });
    }

    if (!location.country || location.country.trim().length < 2 || !location.countryCode) {
      issues.push({
        code: "missing-country",
        severity: "error",
        locationId: where,
        message: "Paese mancante o senza codice ISO.",
      });
    }

    if (![1, 2, 3].includes(location.difficulty)) {
      issues.push({
        code: "invalid-difficulty",
        severity: "error",
        locationId: where,
        message: `Difficoltà non valida: ${location.difficulty}.`,
      });
    }

    if (!VALID_CONTINENTS.has(location.continent)) {
      issues.push({
        code: "invalid-continent",
        severity: "error",
        locationId: where,
        message: `Continente non valido: ${location.continent}.`,
      });
    }

    const hints = location.hints ?? [];
    if (hints.length < 2) {
      issues.push({
        code: "missing-hints",
        severity: "error",
        locationId: where,
        message: `Servono almeno 2 indizi, trovati ${hints.length}.`,
      });
    }
    for (const hint of hints) {
      if (hint.trim().length <= 10) {
        issues.push({
          code: "short-hint",
          severity: "error",
          locationId: where,
          message: `Indizio troppo corto o vuoto: "${hint}".`,
        });
      }
    }

    if (!config.knownSources.has(location.sourceId) || !getSource(location.sourceId)) {
      issues.push({
        code: "unknown-source",
        severity: "error",
        locationId: where,
        message: `Fonte non dichiarata nel registro: "${location.sourceId}".`,
      });
    }

    const category = getCategory(location.category as CategoryId);
    if (category.id !== location.category) {
      issues.push({
        code: "unknown-category",
        severity: config.requireKnownCategory ? "error" : "warning",
        locationId: where,
        message: `Categoria non registrata: "${location.category}" (il gioco funziona comunque, ma va documentata).`,
      });
    }

    for (const theme of location.themes as ThemeId[]) {
      const definition = getTheme(theme);
      if (definition.id !== theme) {
        issues.push({
          code: "unknown-theme",
          severity: "warning",
          locationId: where,
          message: `Tema non registrato: "${theme}".`,
        });
      }
    }

    const placeKey = `${location.countryCode}:${location.name.trim().toLowerCase()}`;
    const previous = seenPlaces.get(placeKey);
    if (previous) {
      issues.push({
        code: "duplicate-place",
        severity: "error",
        locationId: where,
        message: `Nome duplicato nello stesso paese: "${location.name}" (già usato da ${previous}).`,
      });
    } else {
      seenPlaces.set(placeKey, location.id);
    }

    if (config.requireGeometryCheck && location.quality.geoCheck === "unavailable") {
      issues.push({
        code: "unchecked-geometry",
        severity: "warning",
        locationId: where,
        message: "Record curato senza verifica punto-entro-confini (geometria non disponibile).",
      });
    }
    if (location.quality.geoCheck === "outside") {
      issues.push({
        code: "invalid-coordinates",
        severity: "error",
        locationId: where,
        message: `La coordinata cade fuori dai confini dichiarati (${location.quality.borderDistanceKm ?? "?"} km).`,
      });
    }
  }

  issues.push(...spatialPairs(locations, config.minSameCategoryKm, config.minAnyKm));
  return issues;
}

/** Raggruppa i problemi per codice (utile nei report e nei test). */
export function summarizeIssues(issues: QualityIssue[]): Record<string, number> {
  return issues.reduce<Record<string, number>>((acc, issue) => {
    acc[issue.code] = (acc[issue.code] ?? 0) + 1;
    return acc;
  }, {});
}

export function errorsOnly(issues: QualityIssue[]): QualityIssue[] {
  return issues.filter((issue) => issue.severity === "error");
}
