// ============================================================
// MondoGioco — Tipi TypeScript principali
// ============================================================

/** Coordinate geografiche */
export interface GeoCoordinates {
  lat: number;
  lng: number;
}

/** Un paese nel dataset del gioco */
export interface Country {
  id: string;
  name: string;
  capital: string;
  continent: Continent;
  flag: string; // Emoji bandiera
  coordinates: GeoCoordinates;
  population: number;
  area: number; // km²
  iso: string; // ISO 3166-1 alpha-2
}

export type Continent =
  "europe" | "asia" | "africa" | "north_america" | "south_america" | "oceania" | "antarctica";

/** Tipo di quiz supportati dal server (`public.question_bank`) */
export type QuizType = "capital" | "flag" | "population" | "continent";

/** Difficoltà del quiz */
export type Difficulty = "easy" | "medium" | "hard";

/**
 * Categoria di un luogo nel gioco geografico sul globo.
 *
 * L'unione NON è chiusa: i valori noti sono quelli registrati in
 * `lib/content/categories.ts`, ma i pacchetti di dati possono introdurne
 * di nuovi senza modifiche al motore di gioco (una categoria sconosciuta
 * riceve un'etichetta di fallback dal registro).
 */
export type LocationCategory =
  | "capital"
  | "city"
  | "monument"
  | "nature"
  | "island"
  | "mountain"
  | "river"
  | "lake"
  | "historic"
  | (string & {});

/** Un luogo reale usabile come obiettivo di un round sul globo */
export interface GameLocation {
  /** Identificativo stabile (slug univoco, mai riutilizzato) */
  id: string;
  /** Nome del luogo in italiano */
  name: string;
  /** Paese/stato a cui appartiene */
  country: string;
  continent: Continent;
  category: LocationCategory;
  /** 1 = facile, 2 = medio, 3 = difficile */
  difficulty: 1 | 2 | 3;
  coordinates: GeoCoordinates;
  /**
   * Indizi testuali progressivi (dal più vago al più specifico),
   * testi originali scritti per MondoGioco. Almeno 2 per luogo.
   */
  hints: string[];
}

/** Modalità del gioco geografico sul globo */
export type GeoGameMode =
  "training" | "challenge" | "timed" | "sprint" | "precision" | "survival" | "daily";

/** Calcolo del livello */
export interface LevelInfo {
  level: number;
  currentXp: number;
  xpForNextLevel: number;
  progress: number; // 0-100
}
