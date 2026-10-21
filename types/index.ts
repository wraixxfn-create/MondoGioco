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

/** Tipo di quiz supportati */
export type QuizType = "capital" | "flag" | "location" | "population" | "continent";

/** Difficoltà del quiz */
export type Difficulty = "easy" | "medium" | "hard";

/** Una domanda del quiz */
export interface QuizQuestion {
  id: string;
  type: QuizType;
  difficulty: Difficulty;
  country: Country;
  prompt: string;
  options: string[];
  correctAnswer: string;
  /** Coordinate corrette (solo per quiz di tipo "location") */
  correctCoordinates?: GeoCoordinates;
  timeLimit: number; // secondi
}

/** Risposta data da un giocatore */
export interface PlayerAnswer {
  questionId: string;
  answer: string;
  coordinates?: GeoCoordinates;
  timeSpent: number; // secondi
  isCorrect: boolean;
  points: number;
}

/** Risultato di una sessione di gioco */
export interface GameSession {
  id: string;
  userId: string | null;
  quizType: QuizType;
  difficulty: Difficulty;
  questions: QuizQuestion[];
  answers: PlayerAnswer[];
  totalScore: number;
  startedAt: string;
  endedAt: string | null;
}

/** Profilo utente */
export interface UserProfile {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  totalScore: number;
  gamesPlayed: number;
  gamesWon: number;
  bestStreak: number;
  level: number;
  xp: number;
  createdAt: string;
  updatedAt: string;
}

/** Voce in classifica */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string | null;
  totalScore: number;
  gamesPlayed: number;
  level: number;
}

/** Stanza multiplayer */
export interface Room {
  id: string;
  code: string;
  hostId: string;
  name: string;
  status: RoomStatus;
  maxPlayers: number;
  currentQuestion: number;
  totalQuestions: number;
  quizType: QuizType;
  difficulty: Difficulty;
  createdAt: string;
  startedAt: string | null;
}

export type RoomStatus = "waiting" | "playing" | "finished";

/** Giocatore in una stanza multiplayer */
export interface RoomPlayer {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  score: number;
  isReady: boolean;
  isHost: boolean;
  currentAnswer: PlayerAnswer | null;
}

/** Stato dell'applicazione per il multiplayer realtime */
export interface RealtimeGameState {
  room: Room;
  players: RoomPlayer[];
  currentQuestion: QuizQuestion | null;
}

/** Categoria di un luogo nel gioco geografico sul globo */
export type LocationCategory = "capital" | "city" | "monument" | "nature" | "island";

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
export type GeoGameMode = "training" | "challenge" | "timed";

/** Calcolo del livello */
export interface LevelInfo {
  level: number;
  currentXp: number;
  xpForNextLevel: number;
  progress: number; // 0-100
}
