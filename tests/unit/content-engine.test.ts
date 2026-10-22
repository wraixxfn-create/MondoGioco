import { describe, it, expect, beforeAll } from "vitest";
import type { ContentIndex } from "@/lib/content/catalog";
import { selectLocations } from "@/lib/content/catalog";
import { generateRounds, DEFAULT_PLAN } from "@/lib/content/selection";
import {
  DEFAULT_CONFIGS,
  createGame,
  submitGuess,
  advanceRound,
  currentTarget,
  summarize,
  createSeededRng,
} from "@/lib/game/engine";
import type { GeoGameState } from "@/lib/game/engine";
import type { HydratedLocation } from "@/data/content/schema";
import { LOCATIONS } from "@/data/locations";
import { loadEverything } from "./content-testkit";

const CONFIG = { ...DEFAULT_CONFIGS.challenge, totalRounds: 5 };

/**
 * Gioca una partita intera rispondendo a un soffio dal bersaglio.
 * Il tempo è iniettato (1 secondo a round) per restare dentro i timer.
 */
function playAll(initial: GeoGameState, offset = 0.05): GeoGameState {
  let state = initial;
  for (let round = 0; round < 50 && state.phase === "playing"; round++) {
    const target = currentTarget(state);
    if (!target) break;
    const now = round * 1000;
    state = submitGuess(
      state,
      { lat: target.coordinates.lat + offset, lng: target.coordinates.lng + offset },
      now
    );
    state = advanceRound(state, now);
  }
  return state;
}

describe("integrazione fra selezione dei contenuti e regole del gioco", () => {
  let index: ContentIndex;

  beforeAll(async () => {
    const all = await loadEverything();
    index = all.index;
  }, 120_000);

  it("la selezione resta fuori dalle regole: il motore usa gli obiettivi ricevuti", () => {
    const rounds = generateRounds(
      selectLocations(index, { continents: ["asia"] }),
      5,
      DEFAULT_PLAN,
      { rng: createSeededRng(99) }
    );
    expect(rounds.length).toBe(5);
    for (const round of rounds) expect(round.continent).toBe("asia");

    const state = createGame(LOCATIONS, CONFIG, createSeededRng(1), 0, { targets: rounds });
    expect(state.targets.map((target) => target.id)).toEqual(rounds.map((round) => round.id));
    expect(state.phase).toBe("playing");
  });

  it("gli obiettivi idratati sono accettati dal motore senza trasformazioni", () => {
    const [target] = generateRounds(selectLocations(index, {}), 1, {}, { rng: createSeededRng(1) });
    const state = createGame(LOCATIONS, { ...CONFIG, totalRounds: 1 }, createSeededRng(1), 0, {
      targets: [target],
    });
    const first = state.targets[0] as HydratedLocation;
    expect(first.hints.length).toBeGreaterThanOrEqual(2);
    expect(first.themes.length).toBeGreaterThanOrEqual(1);
    expect(first.quality).toBeDefined();

    const played = playAll(state);
    expect(played.phase).toBe("finished");
    expect(played.results.length).toBe(1);
  });

  it("senza obiettivi il motore continua a pescare dal dataset di base", () => {
    const state = createGame(LOCATIONS, { ...CONFIG, totalRounds: 8 }, createSeededRng(7), 0);
    expect(state.targets.length).toBe(8);
    expect(new Set(state.targets.map((target) => target.id)).size).toBe(8);
  });

  it("una partita giocata fino in fondo usa contenuti con metadati completi", () => {
    const rounds = generateRounds(
      selectLocations(index, { difficulties: [1] }),
      3,
      {},
      { rng: createSeededRng(4) }
    );
    for (const round of rounds) expect(round.difficulty).toBe(1);
    const state = createGame(LOCATIONS, { ...CONFIG, totalRounds: 3 }, createSeededRng(8), 0, {
      targets: rounds,
    });
    const finished = playAll(state);
    const summary = summarize(finished);

    expect(finished.phase).toBe("finished");
    expect(summary.roundsPlayed).toBe(3);
    expect(summary.answersGiven).toBe(3);
    expect(summary.totalScore).toBeGreaterThan(0);
    expect(summary.bestDistanceKm).not.toBeNull();
    expect((summary.bestDistanceKm ?? 9999) as number).toBeLessThan(50);
  });

  it("il limite di difficoltà massima è rispettato dal generatore e dal motore", () => {
    const easy = generateRounds(
      selectLocations(index, {}),
      6,
      { difficultyMix: { 1: 1, 2: 0, 3: 0 } },
      { rng: createSeededRng(21) }
    );
    for (const round of easy) expect(round.difficulty).toBe(1);

    const state = createGame(LOCATIONS, CONFIG, createSeededRng(3), 0, {
      targets: easy,
      maxDifficulty: 1,
    });
    for (const target of state.targets) expect(target.difficulty).toBe(1);
  });

  it("i round generati non propongono due volte lo stesso luogo in partita", () => {
    const rounds = generateRounds(selectLocations(index, {}), 10, DEFAULT_PLAN, {
      rng: createSeededRng(1234),
    });
    const state = createGame(LOCATIONS, { ...CONFIG, totalRounds: 10 }, createSeededRng(2), 0, {
      targets: rounds,
    });
    const ids = state.targets.map((target) => target.id);
    expect(new Set(ids).size).toBe(ids.length);
    const finished = playAll(state);
    expect(summarize(finished).roundsPlayed).toBe(10);
  });
});
