// ============================================================
// MondoGioco — Schema del sistema di contenuti geografici
// ============================================================
//
// Il sistema di contenuti è pensato per crescere senza toccare il
// motore di gioco (`lib/game/engine.ts`):
//
//   data/content/**        → DATI (pacchetti curati + pacchetti generati)
//   lib/content/registry   → REGISTRO (categorie, temi, pacchetti, loader)
//   lib/content/selection  → LOGICA DI SELEZIONE (generatore di round)
//   lib/game/engine        → REGOLE DEL GIOCO (punteggio, timer, stati)
//   app/**                 → INTERFACCIA
//
// Un "pacchetto" (ContentPack) è un gruppo di luoghi con la stessa
// provenienza e lo stesso ciclo di vita (versione). I pacchetti sono
// caricati on demand: il browser scarica solo quelli richiesti dai
// filtri attivi, non l'intero dataset.
//
// REGOLA FONDAMENTALE SUI DATI
// Le coordinate NON sono inventate: derivano da banche dati con licenza
// compatibile (vedi `sources.ts`). Ogni record dichiara la propria fonte
// (`sourceId`) e i metadati di qualità (`quality`).

import type { Continent, GameLocation, GeoCoordinates } from "@/types";

/**
 * Versione dello schema dei contenuti.
 * Va incrementata solo se cambia la FORMA dei dati (campi, tipi, tuple).
 * Cambiare questo numero invalida lo storico dei luoghi già visti.
 */
export const CONTENT_SCHEMA_VERSION = 2;

/**
 * Id di categoria. Le categorie NON sono un'unione chiusa: nuove
 * categorie si aggiungono dal registro (`lib/content/categories.ts`)
 * senza modificare il motore di gioco.
 */
export type CategoryId = string;

/** Id di un tema (tag trasversale alle categorie). */
export type ThemeId = string;

/** Id di una fonte dati (vedi `sources.ts`). */
export type SourceId = string;

/** Livello di difficoltà di un luogo: 1 = facile, 2 = medio, 3 = difficile. */
export type DifficultyLevel = 1 | 2 | 3;

/** Esito del controllo automatico "il punto cade nel paese dichiarato". */
export type GeoCheckResult =
  /** il punto è dentro i confini del paese dichiarato */
  | "inside"
  /** il punto è vicino al confine/costa (entro la tolleranza): accettato */
  | "near"
  /** il punto è lontano dal paese dichiarato: record scartato o da correggere */
  | "outside"
  /** controllo non eseguibile (es. paese assente nella geometria di riferimento) */
  | "unavailable";

/** Metadati di qualità di un record: servono ai controlli e all'audit. */
export interface LocationQuality {
  /** Accuratezza stimata della coordinata, in metri. */
  coordinateAccuracyM: number;
  /** Esito del controllo punto-entro-confini. */
  geoCheck: GeoCheckResult;
  /** Distanza dal confine più vicino, in km (quando `geoCheck === "near"`). */
  borderDistanceKm?: number;
  /** Record rivisto manualmente (i pacchetti generati sono sempre `false`). */
  reviewed: boolean;
}

/**
 * Record di un luogo così come viene memorizzato nei pacchetti.
 * Gli `hints` sono opzionali: quando mancano vengono generati a runtime
 * dai campi fattuali (vedi `lib/content/hints.ts`), evitando di
 * immagazzinare migliaia di testi duplicati.
 */
export interface LocationRecord {
  /** Id stabile e univoco, mai riutilizzato (es. `gn-3176959`, `monte-bianco`). */
  id: string;
  /** Nome del luogo in italiano. */
  name: string;
  /** Nome del paese/territorio in italiano. */
  country: string;
  /** Codice ISO 3166-1 alpha-2 (o lista separata da `;` se transfrontaliero). */
  countryCode: string;
  continent: Continent;
  category: CategoryId;
  difficulty: DifficultyLevel;
  coordinates: GeoCoordinates;
  /** Tag tematici (vedi `lib/content/themes.ts`). */
  themes?: ThemeId[];
  /** Indizi progressivi: obbligatori solo per i pacchetti curati. */
  hints?: string[];
  /** Fonte del record (vedi `sources.ts`). */
  sourceId: SourceId;
  /** Suddivisione amministrativa di primo livello (quando nota). */
  admin1?: string;
  /** Popolazione (solo insediamenti). */
  population?: number;
  /** Altitudine in metri (rilievi, laghi, insediamenti). */
  elevationM?: number;
}

/**
 * Luogo pronto per il gioco: è un `GameLocation` (contratto del motore)
 * arricchito dai metadati usati dalla selezione e dall'interfaccia.
 * Prodotto da `hydrateRecord()` all'atto del caricamento del pacchetto.
 */
export interface HydratedLocation extends GameLocation {
  countryCode: string;
  themes: ThemeId[];
  sourceId: SourceId;
  admin1?: string;
  population?: number;
  elevationM?: number;
  /** Pacchetto di provenienza (utile per statistiche e debug). */
  packId: string;
  quality: LocationQuality;
}

// ------------------------------------------------------------
// Formati compatti di memorizzazione
// ------------------------------------------------------------

/** Flag bitmask usati dai pacchetti generati (città). */
export const LOCATION_FLAGS = {
  /** entro 25 km dalla costa */
  COASTAL: 1,
  /** oltre 5 milioni di abitanti */
  MEGACITY: 2,
  /** oltre 1 milione di abitanti */
  METROPOLIS: 4,
  /** capoluogo di una suddivisione di primo livello (PPLA/PPLA2) */
  ADMIN_CAPITAL: 8,
  /** capitale nazionale (PPLC) */
  CAPITAL: 16,
} as const;

/** Codifica compatta di `GeoCheckResult` nei pacchetti generati. */
export const GEO_CHECK_CODE = {
  inside: 0,
  near: 1,
  outside: 2,
  unavailable: 3,
} as const;

/**
 * Riga compatta di un pacchetto generato.
 * [id, nome, iso2, admin1, categoria, difficoltà, lat, lng, popolazione, flag, geoCheck]
 */
export type PackedRow = [
  id: string,
  name: string,
  countryCode: string,
  admin1: string,
  category: CategoryId,
  difficulty: DifficultyLevel,
  lat: number,
  lng: number,
  population: number,
  flags: number,
  geoCheck: number,
];

/** Riga di un pacchetto curato (leggibile e modificabile a mano). */
export type CuratedRow = [
  id: string,
  name: string,
  country: string,
  countryCode: string,
  continent: Continent,
  category: CategoryId,
  difficulty: DifficultyLevel,
  lat: number,
  lng: number,
  themes: ThemeId[],
  hints: string[],
];

/** Pacchetto generato da script (`scripts/build-content.mjs`). */
export interface GeneratedPack {
  id: string;
  /** Versione semver del pacchetto: cambia quando i dati cambiano. */
  version: string;
  title: string;
  description: string;
  /** Continenti coperti (usato per decidere se caricare il pacchetto). */
  continents: Continent[];
  /** Fonte principale dei dati. */
  sourceId: SourceId;
  /** Categorie presenti nel pacchetto. */
  categories: CategoryId[];
  rows: PackedRow[];
}

/** Pacchetto scritto a mano (indizi originali, revisione umana). */
export interface CuratedPack {
  id: string;
  version: string;
  title: string;
  description: string;
  sourceId: SourceId;
  /** I record curati sono rivisti a mano: qualità dichiarata esplicitamente. */
  rows: CuratedRow[];
}

/** Riferimento geografico di un paese (tabella generata). */
export interface CountryReference {
  /** ISO 3166-1 alpha-2 */
  iso2: string;
  /** ISO 3166-1 alpha-3 */
  iso3: string;
  /** ISO 3166-1 numeric (chiave di join con le geometrie Natural Earth) */
  numeric: string;
  /** Nome in italiano */
  nameIt: string;
  /** Nome in inglese (allineato a Natural Earth) */
  nameEn: string;
  continent: Continent;
  /** Nome della capitale (quando nota) */
  capitalName: string;
  /** Coordinate della capitale (quando note) */
  capitalCoords?: GeoCoordinates;
  /** Bounding box del paese [minLng, minLat, maxLng, maxLat] */
  bbox?: [number, number, number, number];
}

/** Manifest dei contenuti: versione globale e inventario dei pacchetti. */
export interface ContentManifest {
  schemaVersion: number;
  /** Versione dei contenuti (semver): cambia a ogni aggiornamento dei dati. */
  contentVersion: string;
  /** Data di generazione (ISO 8601). */
  generatedAt: string;
  /** Numero totale di luoghi. */
  totalLocations: number;
  packs: {
    id: string;
    version: string;
    title: string;
    count: number;
    /** Byte del file sorgente del pacchetto (stima, per il budget client). */
    approxBytes: number;
    sourceIds: SourceId[];
    curated: boolean;
  }[];
}
