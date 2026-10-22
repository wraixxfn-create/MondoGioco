// ============================================================
// MondoGioco — Generatore di round
// ============================================================
// Il generatore NON conosce le regole del gioco (punteggi, timer):
// produce solo l'elenco ordinato degli obiettivi. Le regole vivono in
// `lib/game/engine.ts`, i dati in `data/content/**`.
//
// Tre obiettivi, in ordine di importanza:
// 1. MAI ripetere un luogo nella stessa sessione;
// 2. ridurre la probabilità di rivedere luoghi delle sessioni recenti
//    (penalità decrescente a ogni sessione trascorsa);
// 3. distribuire la difficoltà e la geografia secondo un piano
//    dichiarato (`RoundPlan`), evitando che i round si assomiglino
//    (stesso paese, stesso continente, punti troppo vicini).
//
// Determinismo: con lo stesso RNG e gli stessi ingressi, l'output è
// identico. Questo rende testabili la distribuzione e la varietà.

import type { DifficultyLevel, HydratedLocation } from "@/data/content/schema";
import type { Rng } from "@/lib/game/engine";
import { haversineDistanceKm } from "@/lib/game/geo";

/** Pesi relativi per livello di difficoltà. */
export interface DifficultyMix {
  1?: number;
  2?: number;
  3?: number;
}

export interface RoundPlan {
  /** Distribuzione desiderata della difficoltà (ignorata se `ramp`). */
  difficultyMix?: DifficultyMix;
  /** Se true la difficoltà cresce progressivamente durante la sessione. */
  ramp?: boolean;
  /** Distanza minima fra due obiettivi della stessa sessione (km). */
  minSeparationKm?: number;
  /** Numero massimo di obiettivi per paese nella stessa sessione. */
  maxPerCountry?: number;
  /** Numero massimo di obiettivi per continente nella stessa sessione. */
  maxPerContinent?: number;
  /** Tentativi di estrazione per round prima di allentare i vincoli. */
  attempts?: number;
}

export const DEFAULT_PLAN: Required<
  Pick<RoundPlan, "minSeparationKm" | "maxPerCountry" | "attempts">
> = {
  /** 40 km: due obiettivi più vicini sarebbero indistinguibili sul globo. */
  minSeparationKm: 40,
  maxPerCountry: 2,
  attempts: 24,
};

/** Miscela bilanciata usata in assenza di indicazioni. */
export const BALANCED_MIX: Required<DifficultyMix> = { 1: 0.25, 2: 0.4, 3: 0.35 };

/**
 * Penalità di ripetizione: 0 = escluso, 1 = peso pieno.
 * È il cuore del meccanismo "meno ripetizioni fra sessioni consecutive".
 */
export function recencyWeight(sessionsAgo: number | undefined): number {
  if (sessionsAgo === undefined || !Number.isFinite(sessionsAgo)) return 1;
  if (sessionsAgo <= 0) return 0;
  if (sessionsAgo === 1) return 0.05;
  if (sessionsAgo === 2) return 0.2;
  if (sessionsAgo === 3) return 0.45;
  if (sessionsAgo === 4) return 0.7;
  return 1;
}

export interface SelectionContext {
  rng?: Rng;
  /** Luoghi già usati in questa sessione (partita o insieme di partite). */
  sessionSeen?: Iterable<string>;
  /** Storico: id → indice dell'ultima sessione in cui è apparso. */
  recency?: Map<string, number>;
  /** Indice della sessione corrente. */
  sessionIndex?: number;
}

const LEVELS: DifficultyLevel[] = [1, 2, 3];

/**
 * Riparte `count` round fra i livelli di difficoltà secondo il piano.
 * Le quote sono deterministiche: la somma è sempre `count`.
 */
export function planDifficultySlots(count: number, plan: RoundPlan = {}): DifficultyLevel[] {
  if (count <= 0) return [];
  if (plan.ramp) {
    // Rampa: si parte dal livello 1 e si sale in modo uniforme.
    const slots: DifficultyLevel[] = [];
    for (let i = 0; i < count; i++) {
      const position = count === 1 ? 0 : i / (count - 1);
      const level = position < 0.34 ? 1 : position < 0.67 ? 2 : 3;
      slots.push(level as DifficultyLevel);
    }
    return slots;
  }

  const mix = plan.difficultyMix ?? BALANCED_MIX;
  const weights = LEVELS.map((level) => Math.max(0, mix[level] ?? 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const slots: DifficultyLevel[] = [];
  if (total <= 0) return new Array<DifficultyLevel>(count).fill(2);

  const quota = LEVELS.map((level, index) => ({
    level,
    exact: (count * weights[index]) / total,
    count: Math.floor((count * weights[index]) / total),
  }));
  let assigned = quota.reduce((sum, entry) => sum + entry.count, 0);
  // I resti vanno ai livelli con la parte frazionaria maggiore.
  quota.sort((a, b) => b.exact - b.count - (a.exact - a.count));
  let cursor = 0;
  while (assigned < count) {
    quota[cursor % quota.length].count++;
    assigned++;
    cursor++;
  }
  for (const entry of quota) {
    for (let i = 0; i < entry.count; i++) slots.push(entry.level);
  }
  // Ordine deterministico ma non monotono: i livelli vengono alternati.
  return interleave(slots);
}

/** Alterna i livelli evitando lunghe sequenze uguali. */
function interleave(slots: DifficultyLevel[]): DifficultyLevel[] {
  const buckets = new Map<DifficultyLevel, DifficultyLevel[]>();
  for (const level of slots) {
    const bucket = buckets.get(level) ?? [];
    bucket.push(level);
    buckets.set(level, bucket);
  }
  const order: DifficultyLevel[] = [];
  const remaining = [...buckets.values()];
  while (remaining.length > 0) {
    remaining.sort((a, b) => b.length - a.length);
    const [bucket] = remaining;
    order.push(bucket.shift() as DifficultyLevel);
    if (bucket.length === 0) remaining.shift();
  }
  return order.reverse();
}

interface Candidate {
  location: HydratedLocation;
  weight: number;
}

interface PickState {
  picked: HydratedLocation[];
  usedIds: Set<string>;
  perCountry: Map<string, number>;
  perContinent: Map<string, number>;
}

function respectsConstraints(
  state: PickState,
  location: HydratedLocation,
  plan: RoundPlan,
  minSeparationKm: number
): boolean {
  const maxPerCountry = plan.maxPerCountry ?? DEFAULT_PLAN.maxPerCountry;
  const maxPerContinent = plan.maxPerContinent ?? Number.POSITIVE_INFINITY;
  if (maxPerCountry !== Number.POSITIVE_INFINITY) {
    for (const code of location.countryCode.split(";")) {
      if ((state.perCountry.get(code) ?? 0) >= maxPerCountry) return false;
    }
  }
  if (
    maxPerContinent !== Number.POSITIVE_INFINITY &&
    (state.perContinent.get(location.continent) ?? 0) >= maxPerContinent
  ) {
    return false;
  }
  if (minSeparationKm > 0) {
    for (const picked of state.picked) {
      if (haversineDistanceKm(picked.coordinates, location.coordinates) < minSeparationKm) {
        return false;
      }
    }
  }
  return true;
}

function weightedPick(candidates: Candidate[], rng: Rng): HydratedLocation | null {
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  if (total <= 0) return null;
  let ticket = rng() * total;
  for (const candidate of candidates) {
    ticket -= candidate.weight;
    if (ticket <= 0) return candidate.location;
  }
  return candidates[candidates.length - 1]?.location ?? null;
}

/**
 * Genera `count` obiettivi distinti rispettando piano, vincoli geografici
 * e storico delle ripetizioni. Se il pool non basta, restituisce tutti i
 * luoghi disponibili (mai duplicati, mai un errore silenzioso).
 */
export function generateRounds(
  pool: HydratedLocation[],
  count: number,
  plan: RoundPlan = {},
  context: SelectionContext = {}
): HydratedLocation[] {
  const rng = context.rng ?? Math.random;
  const sessionSeen = new Set(context.sessionSeen ?? []);
  const sessionIndex = context.sessionIndex ?? 0;
  const recency = context.recency;
  const attempts = plan.attempts ?? DEFAULT_PLAN.attempts;

  const candidates: Candidate[] = [];
  for (const location of pool) {
    if (sessionSeen.has(location.id)) continue;
    const sessionsAgo = recency
      ? recency.has(location.id)
        ? sessionIndex - (recency.get(location.id) as number)
        : undefined
      : undefined;
    const weight = recencyWeight(sessionsAgo);
    if (weight <= 0) continue;
    candidates.push({ location, weight });
  }

  const byDifficulty = new Map<DifficultyLevel, Candidate[]>();
  for (const candidate of candidates) {
    const bucket = byDifficulty.get(candidate.location.difficulty) ?? [];
    bucket.push(candidate);
    byDifficulty.set(candidate.location.difficulty, bucket);
  }

  const slots = planDifficultySlots(Math.min(count, candidates.length), plan);
  const state: PickState = {
    picked: [],
    usedIds: new Set(),
    perCountry: new Map(),
    perContinent: new Map(),
  };

  for (const level of slots) {
    const order = [level, ...LEVELS.filter((other) => other !== level)];
    let chosen: HydratedLocation | null = null;

    // Tre passaggi: vincoli pieni → senza separazione → senza vincoli.
    for (const relaxation of [0, 1, 2]) {
      const minSeparationKm =
        relaxation >= 1 ? 0 : (plan.minSeparationKm ?? DEFAULT_PLAN.minSeparationKm);
      const relaxedPlan: RoundPlan =
        relaxation >= 2
          ? {
              ...plan,
              maxPerCountry: Number.POSITIVE_INFINITY,
              maxPerContinent: Number.POSITIVE_INFINITY,
            }
          : plan;
      for (const difficulty of order) {
        const bucket = byDifficulty.get(difficulty);
        if (!bucket || bucket.length === 0) continue;
        for (let attempt = 0; attempt < attempts; attempt++) {
          const pick = weightedPick(bucket, rng);
          if (!pick || state.usedIds.has(pick.id)) continue;
          if (relaxation === 0 && !respectsConstraints(state, pick, relaxedPlan, minSeparationKm)) {
            continue;
          }
          chosen = pick;
          break;
        }
        if (chosen) break;
      }
      if (chosen) break;
    }

    if (!chosen) break;
    state.picked.push(chosen);
    state.usedIds.add(chosen.id);
    for (const code of chosen.countryCode.split(";")) {
      state.perCountry.set(code, (state.perCountry.get(code) ?? 0) + 1);
    }
    state.perContinent.set(chosen.continent, (state.perContinent.get(chosen.continent) ?? 0) + 1);
  }

  return state.picked;
}

/**
 * Quanti round "freschi" (mai visti o visti più di 4 sessioni fa) sono
 * ancora disponibili: indicatore di varietà residua per la UI e i test.
 */
export function freshPoolSize(pool: HydratedLocation[], context: SelectionContext = {}): number {
  const sessionIndex = context.sessionIndex ?? 0;
  const recency = context.recency;
  let fresh = 0;
  for (const location of pool) {
    if (!recency || !recency.has(location.id)) {
      fresh++;
      continue;
    }
    if (recencyWeight(sessionIndex - (recency.get(location.id) as number)) >= 1) fresh++;
  }
  return fresh;
}
