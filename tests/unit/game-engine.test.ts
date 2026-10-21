import { describe, it, expect } from "vitest";
import {
  createGame,
  createSeededRng,
  submitGuess,
  advanceRound,
  revealNextHint,
  currentTarget,
  isRoundExpired,
  isGameExpired,
  finishGame,
  summarize,
  pickLocations,
  EmptyDatasetError,
  DEFAULT_CONFIGS,
  HINT_PENALTY_FACTOR,
  type GeoGameConfig,
} from "@/lib/game/engine";
import { LOCATIONS } from "@/data/locations";
import type { GameLocation } from "@/types";

const T0 = 1_000_000; // timestamp fittizio per test deterministici

function challengeConfig(rounds = 3, seconds = 60): GeoGameConfig {
  return { mode: "challenge", totalRounds: rounds, secondsPerRound: seconds, totalSeconds: 0 };
}

describe("creazione partita e determinismo", () => {
  it("con lo stesso seed estrae gli stessi luoghi nello stesso ordine", () => {
    const a = createGame(LOCATIONS, challengeConfig(5), createSeededRng(42), T0);
    const b = createGame(LOCATIONS, challengeConfig(5), createSeededRng(42), T0);
    expect(a.targets.map((t) => t.id)).toEqual(b.targets.map((t) => t.id));
  });

  it("i luoghi estratti sono tutti distinti", () => {
    const g = createGame(LOCATIONS, challengeConfig(10), createSeededRng(7), T0);
    const ids = g.targets.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(10);
  });

  it("se si chiedono più round dei luoghi disponibili, usa tutto il dataset", () => {
    const tiny = LOCATIONS.slice(0, 3);
    const g = createGame(tiny, challengeConfig(10), createSeededRng(1), T0);
    expect(g.targets).toHaveLength(3);
  });

  it("dataset vuoto → EmptyDatasetError gestibile dalla UI", () => {
    expect(() => createGame([], challengeConfig(), Math.random, T0)).toThrow(
      EmptyDatasetError
    );
    expect(() => pickLocations([], 5, Math.random)).toThrow(EmptyDatasetError);
  });

  it("dataset con sole coordinate invalide → EmptyDatasetError", () => {
    const broken: GameLocation[] = [
      {
        id: "x", name: "X", country: "Y", continent: "europe", category: "city",
        difficulty: 1, coordinates: { lat: 200, lng: 999 }, hints: ["a", "b"],
      },
    ];
    expect(() => createGame(broken, challengeConfig(), Math.random, T0)).toThrow(
      EmptyDatasetError
    );
  });

  it("imposta correttamente le scadenze dei timer", () => {
    const g = createGame(LOCATIONS, challengeConfig(5, 60), createSeededRng(3), T0);
    expect(g.roundExpiresAt).toBe(T0 + 60_000);
    expect(g.gameExpiresAt).toBeNull();

    const t = createGame(LOCATIONS, DEFAULT_CONFIGS.timed, createSeededRng(3), T0);
    expect(t.gameExpiresAt).toBe(T0 + 120_000);
    expect(t.roundExpiresAt).toBeNull();

    const tr = createGame(LOCATIONS, DEFAULT_CONFIGS.training, createSeededRng(3), T0);
    expect(tr.roundExpiresAt).toBeNull();
    expect(tr.gameExpiresAt).toBeNull();
  });
});

describe("risposte e punteggi", () => {
  it("risposta perfetta (coordinate identiche) → 5000 punti, distanza 0", () => {
    let g = createGame(LOCATIONS, challengeConfig(3), createSeededRng(11), T0);
    const target = currentTarget(g)!;
    g = submitGuess(g, { ...target.coordinates }, T0 + 5_000);
    expect(g.phase).toBe("revealed");
    expect(g.results[0].distanceKm).toBeCloseTo(0, 9);
    expect(g.results[0].score).toBe(5000);
    expect(g.totalScore).toBe(5000);
    expect(g.results[0].timedOut).toBe(false);
  });

  it("risposta lontana → pochi punti, distanza coerente con Haversine", () => {
    let g = createGame(LOCATIONS, challengeConfig(3), createSeededRng(12), T0);
    const target = currentTarget(g)!;
    // risposta agli antipodi approssimativi
    const antipode = { lat: -target.coordinates.lat, lng: target.coordinates.lng >= 0 ? target.coordinates.lng - 180 : target.coordinates.lng + 180 };
    g = submitGuess(g, antipode, T0 + 10_000);
    expect(g.results[0].distanceKm!).toBeGreaterThan(18000);
    expect(g.results[0].score).toBeLessThan(5);
  });

  it("una seconda risposta nello stesso round viene ignorata", () => {
    let g = createGame(LOCATIONS, challengeConfig(3), createSeededRng(13), T0);
    const target = currentTarget(g)!;
    g = submitGuess(g, { ...target.coordinates }, T0 + 1_000);
    const after = submitGuess(g, { lat: 0, lng: 0 }, T0 + 2_000);
    expect(after.results).toHaveLength(1);
    expect(after.totalScore).toBe(g.totalScore);
  });
});

describe("scadenza dei timer", () => {
  it("isRoundExpired diventa true alla scadenza del round", () => {
    const g = createGame(LOCATIONS, challengeConfig(3, 60), createSeededRng(21), T0);
    expect(isRoundExpired(g, T0 + 59_999)).toBe(false);
    expect(isRoundExpired(g, T0 + 60_000)).toBe(true);
  });

  it("timeout del round (guess null) → 0 punti, distanza null, round chiuso", () => {
    let g = createGame(LOCATIONS, challengeConfig(3, 60), createSeededRng(22), T0);
    g = submitGuess(g, null, T0 + 60_000);
    expect(g.results[0].timedOut).toBe(true);
    expect(g.results[0].score).toBe(0);
    expect(g.results[0].distanceKm).toBeNull();
    expect(g.phase).toBe("revealed");
  });

  it("una risposta data DOPO la scadenza è trattata come timeout", () => {
    let g = createGame(LOCATIONS, challengeConfig(3, 60), createSeededRng(23), T0);
    const target = currentTarget(g)!;
    g = submitGuess(g, { ...target.coordinates }, T0 + 60_001);
    expect(g.results[0].timedOut).toBe(true);
    expect(g.results[0].score).toBe(0);
  });

  it("modalità timed: allo scadere del timer totale la partita finisce", () => {
    let g = createGame(LOCATIONS, DEFAULT_CONFIGS.timed, createSeededRng(24), T0);
    expect(isGameExpired(g, T0 + 119_999)).toBe(false);
    expect(isGameExpired(g, T0 + 120_000)).toBe(true);
    // chiudo il round corrente e provo ad avanzare a tempo scaduto
    g = submitGuess(g, null, T0 + 120_000);
    g = advanceRound(g, T0 + 120_500);
    expect(g.phase).toBe("finished");
  });

  it("training: nessun timer scade mai", () => {
    const g = createGame(LOCATIONS, DEFAULT_CONFIGS.training, createSeededRng(25), T0);
    expect(isRoundExpired(g, T0 + 10_000_000)).toBe(false);
    expect(isGameExpired(g, T0 + 10_000_000)).toBe(false);
  });
});

describe("indizi e penalità", () => {
  it("gli indizi si rivelano in ordine e non oltre il totale", () => {
    let g = createGame(LOCATIONS, challengeConfig(3), createSeededRng(31), T0);
    const target = currentTarget(g)!;
    expect(g.hintsShown).toBe(1);
    for (let i = 0; i < 10; i++) g = revealNextHint(g);
    expect(g.hintsShown).toBe(target.hints.length);
  });

  it("challenge: il 2° indizio applica la penalità ×0.9 documentata", () => {
    let g = createGame(LOCATIONS, challengeConfig(3), createSeededRng(32), T0);
    const target = currentTarget(g)!;
    g = revealNextHint(g); // ora 2 indizi
    g = submitGuess(g, { ...target.coordinates }, T0 + 3_000);
    expect(g.results[0].baseScore).toBe(5000);
    expect(g.results[0].score).toBe(Math.round(5000 * HINT_PENALTY_FACTOR));
  });

  it("training: indizi gratuiti, nessuna penalità", () => {
    let g = createGame(LOCATIONS, DEFAULT_CONFIGS.training, createSeededRng(33), T0);
    const target = currentTarget(g)!;
    g = revealNextHint(revealNextHint(g));
    g = submitGuess(g, { ...target.coordinates }, T0 + 3_000);
    expect(g.results[0].score).toBe(5000);
  });
});

describe("completamento partita e riepilogo", () => {
  it("una sfida completa termina, con riepilogo coerente", () => {
    let g = createGame(LOCATIONS, challengeConfig(3, 60), createSeededRng(41), T0);
    let now = T0;
    for (let round = 0; round < 3; round++) {
      const target = currentTarget(g)!;
      now += 5_000;
      g = submitGuess(g, { ...target.coordinates }, now);
      now += 1_000;
      g = advanceRound(g, now);
    }
    expect(g.phase).toBe("finished");

    const summary = summarize(g);
    expect(summary.roundsPlayed).toBe(3);
    expect(summary.totalScore).toBe(15_000);
    expect(summary.maxPossibleScore).toBe(15_000);
    expect(summary.averageScore).toBe(5000);
    expect(summary.bestDistanceKm).toBeCloseTo(0, 9);
    expect(summary.answersGiven).toBe(3);
    expect(summary.timeouts).toBe(0);
    expect(summary.bullseyes).toBe(3);
  });

  it("il riepilogo conta correttamente i timeout", () => {
    let g = createGame(LOCATIONS, challengeConfig(2, 30), createSeededRng(42), T0);
    g = submitGuess(g, null, T0 + 30_000);
    g = advanceRound(g, T0 + 31_000);
    const target = currentTarget(g)!;
    g = submitGuess(g, { ...target.coordinates }, T0 + 35_000);
    g = advanceRound(g, T0 + 36_000);
    expect(g.phase).toBe("finished");
    const s = summarize(g);
    expect(s.timeouts).toBe(1);
    expect(s.answersGiven).toBe(1);
    expect(s.totalScore).toBe(5000);
  });

  it("il timer del round riparte a ogni nuovo round", () => {
    let g = createGame(LOCATIONS, challengeConfig(3, 60), createSeededRng(43), T0);
    g = submitGuess(g, null, T0 + 60_000);
    g = advanceRound(g, T0 + 61_000);
    expect(g.roundIndex).toBe(1);
    expect(g.phase).toBe("playing");
    expect(g.roundExpiresAt).toBe(T0 + 61_000 + 60_000);
    expect(g.hintsShown).toBe(1);
  });

  it("finishGame chiude volontariamente (es. uscita dall'allenamento)", () => {
    let g = createGame(LOCATIONS, DEFAULT_CONFIGS.training, createSeededRng(44), T0);
    const target = currentTarget(g)!;
    g = submitGuess(g, { ...target.coordinates }, T0 + 2_000);
    g = finishGame(g);
    expect(g.phase).toBe("finished");
    expect(summarize(g).roundsPlayed).toBe(1);
  });

  it("riepilogo di una partita senza risposte: nessuna divisione per zero", () => {
    const g = finishGame(createGame(LOCATIONS, challengeConfig(3), createSeededRng(45), T0));
    const s = summarize(g);
    expect(s.roundsPlayed).toBe(0);
    expect(s.averageScore).toBe(0);
    expect(s.bestDistanceKm).toBeNull();
    expect(s.averageDistanceKm).toBeNull();
  });
});

describe("RNG con seed", () => {
  it("produce sequenze riproducibili e in [0,1)", () => {
    const a = createSeededRng(99);
    const b = createSeededRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
