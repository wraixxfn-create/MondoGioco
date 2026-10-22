// ============================================================
// MondoGioco — Motore del gioco geografico (macchina a stati pura)
// ============================================================
//
// Nessuna dipendenza da React, Three.js o dal DOM: l'intera logica
// di partita è qui ed è testata da `tests/unit/game-engine.test.ts`.
//
// Determinismo: dato lo stesso generatore casuale (RNG iniettabile)
// e le stesse risposte, la partita produce sempre gli stessi esiti.
// Il punteggio dipende SOLO dalla distanza (vedi `geo.ts`), più
// l'eventuale penalità indizi documentata qui sotto.
//
// MODALITÀ
// - "training"  Allenamento libero: nessun timer, round illimitati,
//               indizi gratuiti, punteggio solo come feedback.
// - "challenge" Sfida a round: N round (configurabile), timer per
//               round, punteggio cumulativo e riepilogo finale.
// - "timed"     Contro il tempo: un unico timer totale; si giocano
//               più round possibile finché scade il tempo.
// - "sprint"    Sprint: 5 round rapidissimi (15s), combo bonus.
// - "precision" Precisione: 5 round senza timer, penalità indizi
//               più severa, bonus precisione.
// - "survival"  Sopravvivenza: vite limitate, finisce a 3 errori.
// - "daily"     Sfida giornaliera: seed giornaliero, 5 round.
// REGOLE DI PUNTEGGIO (vedi anche geo.ts)
// - base = calculateScore(distanza_km)  →  0..5000 punti.
// - penalità indizi (solo challenge/timed): il 1° indizio è gratuito
//   (è la traccia del round); ogni indizio extra moltiplica il
//   punteggio per 0.9 (2° indizio → ×0.9, 3° → ×0.81).
// - timeout o nessuna risposta → 0 punti e distanza null.

import type { GameLocation, GeoCoordinates, GeoGameMode } from "@/types";
import { calculateScore, haversineDistanceKm, isValidCoordinates } from "./geo";

export class EmptyDatasetError extends Error {
  constructor() {
    super("Il dataset dei luoghi è vuoto o non valido: impossibile avviare la partita.");
    this.name = "EmptyDatasetError";
  }
}

/** RNG con la stessa interfaccia di Math.random (iniettabile nei test). */
export type Rng = () => number;

/**
 * RNG deterministico (mulberry32) utile per test e riproducibilità.
 * NON è crittograficamente sicuro: serve solo a mescolare i luoghi.
 */
export function createSeededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GeoGameConfig {
  mode: GeoGameMode;
  /** Numero di round per la modalità challenge (ignorata nelle altre). */
  totalRounds: number;
  /** Secondi per round (challenge). 0 = nessun limite per round. */
  secondsPerRound: number;
  /** Secondi totali di partita (timed). */
  totalSeconds: number;
  /** Vite per survival (solo survival) */
  lives?: number;
  /** Se true, attiva combo/streak bonus */
  comboEnabled?: boolean;
}

export const DEFAULT_CONFIGS: Record<GeoGameMode, GeoGameConfig> = {
  training: { mode: "training", totalRounds: Infinity, secondsPerRound: 0, totalSeconds: 0 },
  challenge: { mode: "challenge", totalRounds: 5, secondsPerRound: 60, totalSeconds: 0 },
  timed: { mode: "timed", totalRounds: Infinity, secondsPerRound: 0, totalSeconds: 120 },
  sprint: {
    mode: "sprint",
    totalRounds: 5,
    secondsPerRound: 15,
    totalSeconds: 0,
    comboEnabled: true,
  },
  precision: {
    mode: "precision",
    totalRounds: 5,
    secondsPerRound: 0,
    totalSeconds: 0,
    comboEnabled: true,
  },
  survival: {
    mode: "survival",
    totalRounds: Infinity,
    secondsPerRound: 45,
    totalSeconds: 0,
    lives: 3,
    comboEnabled: true,
  },
  daily: {
    mode: "daily",
    totalRounds: 5,
    secondsPerRound: 60,
    totalSeconds: 0,
    comboEnabled: true,
  },
};

/** Penalità moltiplicativa per ogni indizio extra oltre il primo. */
export const HINT_PENALTY_FACTOR = 0.9;
export const PRECISION_HINT_PENALTY = 0.75;

/** Combo / streak */
export const COMBO_GOOD_THRESHOLD_KM = 700; // entro 700km = streak continua
export const COMBO_BONUS_PER_STREAK = 0.05; // +5% per streak dopo il primo
export const MAX_COMBO_MULTIPLIER = 1.25; // cap 25%
export const SURVIVAL_FAIL_THRESHOLD_KM = 1500;
export const SURVIVAL_MAX_LIVES = 3;

/** Seed giornaliero deterministico YYYY-MM-DD -> number */
export function dailySeed(date: Date = new Date()): number {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  // semplice hash
  return y * 10000 + m * 100 + d + 0x9e3779b9;
}

export interface RoundResult {
  location: GameLocation;
  /** Risposta del giocatore, null se timeout/nessuna risposta. */
  guess: GeoCoordinates | null;
  /** Distanza in km, null se nessuna risposta. */
  distanceKm: number | null;
  /** Punti finali (dopo penalità indizi + bonus combo). */
  score: number;
  /** Punti dalla sola distanza, prima delle penalità. */
  baseScore: number;
  hintsUsed: number;
  /** Secondi impiegati a rispondere. */
  timeSpentSeconds: number;
  timedOut: boolean;
  /** Combo streak al momento di questo round (0 se rotto) */
  streak?: number;
  /** Bonus combo in punti */
  bonusScore?: number;
  /** Moltiplicatore combo applicato (1 = nessuno) */
  comboMultiplier?: number;
}

export type GamePhase = "playing" | "revealed" | "finished";

export interface GeoGameState {
  config: GeoGameConfig;
  /** Luoghi estratti per la partita (in ordine di gioco). */
  targets: GameLocation[];
  /** Indice del round corrente (0-based). */
  roundIndex: number;
  phase: GamePhase;
  results: RoundResult[];
  /** Quanti indizi sono visibili nel round corrente (minimo 1). */
  hintsShown: number;
  /** Timestamp (ms) di inizio partita e del round corrente. */
  startedAt: number;
  roundStartedAt: number;
  /** Scadenza del round corrente (ms), null se non c'è timer di round. */
  roundExpiresAt: number | null;
  /** Scadenza dell'intera partita (ms), null se non c'è timer totale. */
  gameExpiresAt: number | null;
  totalScore: number;
  /** Streak corrente di round buoni (combo) */
  streak: number;
  /** Miglior streak della partita */
  bestStreak: number;
  /** Vite rimaste (solo survival) */
  livesRemaining: number | null;
}

/**
 * Estrae `count` luoghi distinti in ordine casuale (Fisher-Yates).
 * Se count > dimensione del dataset, usa tutto il dataset.
 * Tabella vuota → EmptyDatasetError (errore gestibile dalla UI).
 */
export function pickLocations(
  dataset: GameLocation[],
  count: number,
  rng: Rng,
  maxDifficulty?: 1 | 2 | 3
): GameLocation[] {
  const pool = dataset.filter(
    (l) =>
      isValidCoordinates(l.coordinates) &&
      (maxDifficulty === undefined || l.difficulty <= maxDifficulty)
  );
  if (pool.length === 0) throw new EmptyDatasetError();
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.max(1, Math.min(count, shuffled.length)));
}

/**
 * Crea una nuova partita. `now` è un timestamp ms iniettabile
 * (default Date.now()) per rendere i test deterministici.
 * Per training/timed i round sono "illimitati": vengono pre-estratti
 * fino a 50 luoghi (più che sufficienti per il timer totale) e la
 * partita termina per scelta del giocatore o allo scadere del timer.
 */
export function createGame(
  dataset: GameLocation[],
  config: GeoGameConfig = DEFAULT_CONFIGS.challenge,
  rng: Rng = Math.random,
  now: number = Date.now()
): GeoGameState {
  const finiteRoundModes: GeoGameMode[] = ["challenge", "sprint", "precision", "daily"];
  const wanted = finiteRoundModes.includes(config.mode) ? config.totalRounds : 50;
  const targets = pickLocations(dataset, wanted, rng);
  const livesRemaining = config.mode === "survival" ? (config.lives ?? SURVIVAL_MAX_LIVES) : null;

  return {
    config,
    targets,
    roundIndex: 0,
    phase: "playing",
    results: [],
    hintsShown: 1,
    startedAt: now,
    roundStartedAt: now,
    roundExpiresAt: config.secondsPerRound > 0 ? now + config.secondsPerRound * 1000 : null,
    gameExpiresAt: config.totalSeconds > 0 ? now + config.totalSeconds * 1000 : null,
    totalScore: 0,
    streak: 0,
    bestStreak: 0,
    livesRemaining,
  };
}

/** Luogo obiettivo del round corrente (undefined se partita finita). */
export function currentTarget(state: GeoGameState): GameLocation | undefined {
  return state.targets[state.roundIndex];
}

/** True se il timer del round corrente è scaduto. */
export function isRoundExpired(state: GeoGameState, now: number): boolean {
  return state.phase === "playing" && state.roundExpiresAt !== null && now >= state.roundExpiresAt;
}

/** True se il timer totale della partita (modalità timed) è scaduto. */
export function isGameExpired(state: GeoGameState, now: number): boolean {
  return state.gameExpiresAt !== null && now >= state.gameExpiresAt;
}

/**
 * Mostra l'indizio successivo del round corrente.
 * No-op se gli indizi sono esauriti o non si sta giocando.
 */
export function revealNextHint(state: GeoGameState): GeoGameState {
  if (state.phase !== "playing") return state;
  const target = currentTarget(state);
  if (!target || state.hintsShown >= target.hints.length) return state;
  return { ...state, hintsShown: state.hintsShown + 1 };
}

function getHintPenalty(config: GeoGameConfig, extraHints: number): number {
  if (config.mode === "training") return 1;
  const factor = config.mode === "precision" ? PRECISION_HINT_PENALTY : HINT_PENALTY_FACTOR;
  return Math.pow(factor, extraHints);
}

function comboMultiplierForStreak(streak: number): number {
  if (streak < 2) return 1;
  const mult = 1 + (streak - 1) * COMBO_BONUS_PER_STREAK;
  return Math.min(mult, MAX_COMBO_MULTIPLIER);
}

/**
 * Registra la risposta del giocatore e chiude il round (fase revealed).
 * `guess` null = nessuna risposta (timeout o scadenza timer totale):
 * 0 punti, distanza null. Una risposta data OLTRE la scadenza viene
 * trattata come timeout (non assegnabile retroattivamente).
 */
export function submitGuess(
  state: GeoGameState,
  guess: GeoCoordinates | null,
  now: number = Date.now()
): GeoGameState {
  if (state.phase !== "playing") return state;
  const target = currentTarget(state);
  if (!target) return { ...state, phase: "finished" };

  const late = guess !== null && (isRoundExpired(state, now) || isGameExpired(state, now));
  const validGuess = guess !== null && !late && isValidCoordinates(guess) ? guess : null;

  const distanceKm =
    validGuess !== null ? haversineDistanceKm(validGuess, target.coordinates) : null;
  const baseScore = distanceKm !== null ? calculateScore(distanceKm) : 0;

  const extraHints = Math.max(0, state.hintsShown - 1);
  const penalty = getHintPenalty(state.config, extraHints);
  const scoreAfterHints = Math.round(baseScore * penalty);

  // Combo / streak: si considera "buono" se entro soglia combo
  const isGoodForStreak = distanceKm !== null && distanceKm <= COMBO_GOOD_THRESHOLD_KM;
  const newStreak = isGoodForStreak ? state.streak + 1 : 0;
  const bestStreak = Math.max(state.bestStreak, newStreak);

  let finalScore = scoreAfterHints;
  let bonusScore = 0;
  let comboMult = 1;
  const useCombo = Boolean(state.config.comboEnabled);
  if (useCombo && isGoodForStreak && scoreAfterHints > 0) {
    comboMult = comboMultiplierForStreak(newStreak);
    finalScore = Math.round(scoreAfterHints * comboMult);
    bonusScore = finalScore - scoreAfterHints;
  }

  // Vite per survival
  let livesRemaining = state.livesRemaining;
  if (state.config.mode === "survival") {
    const failed = distanceKm === null || distanceKm > SURVIVAL_FAIL_THRESHOLD_KM;
    if (failed && livesRemaining !== null) {
      livesRemaining = Math.max(0, livesRemaining - 1);
    }
  }

  const result: RoundResult = {
    location: target,
    guess: validGuess,
    distanceKm,
    score: finalScore,
    baseScore,
    hintsUsed: state.hintsShown,
    timeSpentSeconds: Math.max(0, (now - state.roundStartedAt) / 1000),
    timedOut: validGuess === null,
    streak: newStreak,
    bonusScore,
    comboMultiplier: comboMult,
  };

  return {
    ...state,
    phase: "revealed",
    results: [...state.results, result],
    totalScore: state.totalScore + finalScore,
    streak: newStreak,
    bestStreak,
    livesRemaining,
  };
}

/**
 * Passa al round successivo, oppure chiude la partita se:
 * - sono finiti i round programmati (challenge), oppure
 * - il timer totale è scaduto (timed), oppure
 * - il giocatore ha esaurito i luoghi estratti.
 */
export function advanceRound(state: GeoGameState, now: number = Date.now()): GeoGameState {
  if (state.phase === "finished") return state;

  // Survival: se vite esaurite, fine
  if (
    state.config.mode === "survival" &&
    state.livesRemaining !== null &&
    state.livesRemaining <= 0
  ) {
    return { ...state, phase: "finished" };
  }

  const nextIndex = state.roundIndex + 1;
  const noMoreTargets = nextIndex >= state.targets.length;
  const finiteModes: GeoGameMode[] = ["challenge", "sprint", "precision", "daily"];
  const roundsDone =
    finiteModes.includes(state.config.mode) && state.results.length >= state.config.totalRounds;
  const gameTimeOver = isGameExpired(state, now);

  if (noMoreTargets || roundsDone || gameTimeOver) {
    return { ...state, phase: "finished" };
  }

  return {
    ...state,
    roundIndex: nextIndex,
    phase: "playing",
    hintsShown: 1,
    roundStartedAt: now,
    roundExpiresAt:
      state.config.secondsPerRound > 0 ? now + state.config.secondsPerRound * 1000 : null,
  };
}

/** Chiude volontariamente la partita (es. uscita dall'allenamento). */
export function finishGame(state: GeoGameState): GeoGameState {
  return { ...state, phase: "finished" };
}

/** Riepilogo finale della partita. */
export interface GameSummary {
  totalScore: number;
  roundsPlayed: number;
  /** Media punti per round giocato. */
  averageScore: number;
  /** Migliore (minima) distanza azzeccata, null se nessuna risposta. */
  bestDistanceKm: number | null;
  /** Distanza media delle risposte date, null se nessuna. */
  averageDistanceKm: number | null;
  answersGiven: number;
  timeouts: number;
  /** Risposte entro 100 km (gran colpi). */
  bullseyes: number;
  maxPossibleScore: number;
  results: RoundResult[];
  bestStreak: number;
  totalBonus: number;
}

export function summarize(state: GeoGameState): GameSummary {
  const distances = state.results.map((r) => r.distanceKm).filter((d): d is number => d !== null);
  return {
    totalScore: state.totalScore,
    roundsPlayed: state.results.length,
    averageScore:
      state.results.length > 0 ? Math.round(state.totalScore / state.results.length) : 0,
    bestDistanceKm: distances.length > 0 ? Math.min(...distances) : null,
    averageDistanceKm:
      distances.length > 0 ? distances.reduce((s, d) => s + d, 0) / distances.length : null,
    answersGiven: distances.length,
    timeouts: state.results.filter((r) => r.timedOut).length,
    bullseyes: distances.filter((d) => d <= 100).length,
    maxPossibleScore: state.results.length * 5000,
    results: state.results,
    bestStreak: state.bestStreak ?? 0,
    totalBonus: state.results.reduce((sum, r) => sum + (r.bonusScore ?? 0), 0),
  };
}
