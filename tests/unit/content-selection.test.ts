import { describe, it, expect, beforeAll } from "vitest";
import type { ContentIndex } from "@/lib/content/catalog";
import { buildIndex, selectLocations, countAvailable } from "@/lib/content/catalog";
import {
  DEFAULT_PLAN,
  generateRounds,
  planDifficultySlots,
  recencyWeight,
  freshPoolSize,
} from "@/lib/content/selection";
import type { RoundPlan, SelectionContext } from "@/lib/content/selection";
import { createSeededRng } from "@/lib/game/engine";
import { haversineDistanceKm } from "@/lib/game/geo";
import { countBy, loadEverything } from "./content-testkit";

describe("generatore di round", () => {
  let index: ContentIndex;

  beforeAll(async () => {
    const all = await loadEverything();
    index = all.index;
  }, 120_000);

  function pool(criteria = {}) {
    return selectLocations(index, criteria);
  }

  it("non ripete mai un luogo nella stessa sessione", () => {
    const rng = createSeededRng(1234);
    const rounds = generateRounds(pool(), 60, { minSeparationKm: 40 }, { rng });
    const ids = rounds.map((round) => round.id);
    expect(ids.length).toBe(60);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rispetta i filtri di continente, categoria, difficoltà e paese", () => {
    const rng = createSeededRng(7);
    const criteria = {
      continents: ["europe" as const],
      categories: ["capital"],
      difficulties: [1 as const],
    };
    const rounds = generateRounds(
      selectLocations(index, criteria),
      10,
      { maxPerCountry: 3 },
      { rng }
    );
    expect(rounds.length).toBe(10);
    for (const round of rounds) {
      expect(round.continent).toBe("europe");
      expect(round.category).toBe("capital");
      expect(round.difficulty).toBe(1);
    }

    const italian = generateRounds(
      selectLocations(index, { countries: ["IT"] }),
      8,
      {},
      { rng: createSeededRng(9) }
    );
    expect(italian.length).toBe(8);
    for (const round of italian) expect(round.countryCode.split(";")).toContain("IT");
  });

  it("rispetta il Piano di difficoltà richiesto (mix e rampa)", () => {
    const rng = createSeededRng(2024);
    const plan: RoundPlan = { difficultyMix: { 1: 0.5, 2: 0.3, 3: 0.2 }, maxPerCountry: 5 };
    const rounds = generateRounds(pool(), 200, plan, { rng });
    const share = countBy(rounds, (round) => String(round.difficulty));
    expect(rounds.length).toBe(200);
    expect(Math.abs((share["1"] ?? 0) / 200 - 0.5)).toBeLessThan(0.08);
    expect(Math.abs((share["2"] ?? 0) / 200 - 0.3)).toBeLessThan(0.08);
    expect(Math.abs((share["3"] ?? 0) / 200 - 0.2)).toBeLessThan(0.08);

    const rampSlots = planDifficultySlots(9, { ramp: true });
    expect(rampSlots[0]).toBe(1);
    expect(rampSlots[8]).toBe(3);
    expect(rampSlots.filter((level) => level === 1).length).toBeGreaterThan(0);
  });

  it("è deterministico con lo stesso seed e diverso con seed diversi", () => {
    const first = generateRounds(pool(), 12, {}, { rng: createSeededRng(42) }).map((r) => r.id);
    const second = generateRounds(pool(), 12, {}, { rng: createSeededRng(42) }).map((r) => r.id);
    const third = generateRounds(pool(), 12, {}, { rng: createSeededRng(43) }).map((r) => r.id);
    expect(first).toEqual(second);
    expect(first).not.toEqual(third);
  });

  it("mantiene la separazione minima fra obiettivi della stessa sessione", () => {
    const rng = createSeededRng(555);
    const rounds = generateRounds(pool(), 25, { minSeparationKm: 40 }, { rng });
    for (let i = 0; i < rounds.length; i++) {
      for (let j = i + 1; j < rounds.length; j++) {
        const distance = haversineDistanceKm(rounds[i].coordinates, rounds[j].coordinates);
        expect(distance, `${rounds[i].id} ↔ ${rounds[j].id}`).toBeGreaterThanOrEqual(40);
      }
    }
  });

  it("limita il numero di obiettivi per paese", () => {
    const rng = createSeededRng(77);
    const rounds = generateRounds(pool(), 30, { maxPerCountry: 2 }, { rng });
    const byCountry = countBy(rounds, (round) => round.countryCode);
    for (const [country, count] of Object.entries(byCountry)) {
      expect(count, country).toBeLessThanOrEqual(2);
    }
  });

  it("evita i luoghi visti nelle sessioni recenti e li recupera col tempo", () => {
    const rng = createSeededRng(31);
    const firstSession = generateRounds(pool(), 40, {}, { rng, sessionIndex: 1 });
    const seen = new Map(firstSession.map((round) => [round.id, 1]));

    // Sessione subito dopo: i luoghi appena visti sono quasi esclusi.
    const secondSession = generateRounds(
      pool(),
      40,
      {},
      { rng: createSeededRng(32), sessionIndex: 2, recency: seen }
    );
    const overlap = secondSession.filter((round) => seen.has(round.id)).length;
    expect(overlap).toBeLessThanOrEqual(6);

    // Dopo 5 sessioni tornano disponibili: la varietà non si esaurisce.
    const muchLater = new Map(firstSession.map((round) => [round.id, -10]));
    const laterSession = generateRounds(
      pool(),
      40,
      {},
      { rng: createSeededRng(33), sessionIndex: 1, recency: muchLater }
    );
    expect(laterSession.length).toBe(40);
    expect(freshPoolSize(pool(), { sessionIndex: 1, recency: muchLater })).toBe(pool().length);
  });

  it("la penalità di ripetizione cresce con le sessioni trascorse", () => {
    expect(recencyWeight(undefined)).toBe(1);
    expect(recencyWeight(0)).toBe(0);
    expect(recencyWeight(1)).toBeLessThan(recencyWeight(2));
    expect(recencyWeight(2)).toBeLessThan(recencyWeight(3));
    expect(recencyWeight(6)).toBe(1);
  });

  it("gestisce pool piccoli, filtri impossibili e conteggi eccessivi", () => {
    const tiny = pool().slice(0, 3);
    const rounds = generateRounds(tiny, 10, { minSeparationKm: 40 }, { rng: createSeededRng(1) });
    expect(rounds.length).toBeLessThanOrEqual(3);
    expect(new Set(rounds.map((round) => round.id)).size).toBe(rounds.length);

    expect(generateRounds([], 5, {}, { rng: createSeededRng(1) })).toEqual([]);
    expect(generateRounds(pool(), 0, {}, { rng: createSeededRng(1) })).toEqual([]);

    const impossible = selectLocations(index, { search: "nome-inesistente-xyz" });
    expect(impossible).toEqual([]);
    expect(countAvailable(index, { search: "nome-inesistente-xyz" })).toBe(0);
  });

  it("esclude esplicitamente i luoghi già usati nella sessione", () => {
    const everything = pool();
    const excluded = everything.slice(0, 500).map((location) => location.id);
    const rounds = generateRounds(
      everything,
      20,
      {},
      { rng: createSeededRng(3), sessionSeen: excluded }
    );
    for (const round of rounds) expect(excluded).not.toContain(round.id);
  });

  it("i vincoli si allentano solo quando necessario (non prima)", () => {
    // Pool ristretto a un solo paese: con maxPerCountry 1 serve comunque
    // riempire tutti i round richiesti senza duplicati.
    const italian = selectLocations(index, { countries: ["IT"] });
    const rounds = generateRounds(
      italian,
      Math.min(6, italian.length),
      { maxPerCountry: 1, minSeparationKm: 40 },
      { rng: createSeededRng(11) }
    );
    expect(rounds.length).toBe(Math.min(6, italian.length));
    expect(new Set(rounds.map((round) => round.id)).size).toBe(rounds.length);
  });

  it("l'indice espone faccette coerenti con i dati", () => {
    const facets = index.facets;
    const totalByContinent = facets.continents.reduce((sum, entry) => sum + entry.count, 0);
    expect(totalByContinent).toBe(index.locations.length);
    const totalByDifficulty = facets.difficulties.reduce((sum, entry) => sum + entry.count, 0);
    expect(totalByDifficulty).toBe(index.locations.length);
    for (const entry of facets.categories) expect(entry.label.length).toBeGreaterThan(0);
  });

  it("DEFAULT_PLAN dichiara soglie documentate", () => {
    expect(DEFAULT_PLAN.minSeparationKm).toBe(40);
    expect(DEFAULT_PLAN.maxPerCountry).toBe(2);
  });

  it("può lavorare su un sottoinsieme arbitrario (nessuna dipendenza globale)", () => {
    const subset = selectLocations(index, { categories: ["mountain"] });
    expect(subset.length).toBeGreaterThan(20);
    const localIndex = buildIndex(subset);
    const rounds = generateRounds(
      selectLocations(localIndex, { categories: ["mountain"] }),
      5,
      {},
      { rng: createSeededRng(5) } as SelectionContext
    );
    expect(rounds.length).toBe(5);
    for (const round of rounds) expect(round.category).toBe("mountain");
  });
});
