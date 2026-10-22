import { describe, it, expect, beforeAll } from "vitest";
import type { ContentIndex } from "@/lib/content/catalog";
import { selectLocations } from "@/lib/content/catalog";
import {
  COLLECTIONS,
  getCollection,
  isChallengePack,
  listCollections,
} from "@/lib/content/collections";
import { generateRounds } from "@/lib/content/selection";
import { createSeededRng } from "@/lib/game/engine";
import { isValidCoordinates } from "@/lib/game/geo";
import type { DifficultyLevel } from "@/data/content/schema";
import { loadEverything } from "./content-testkit";

describe("mappe tematiche e pacchetti di sfida", () => {
  let index: ContentIndex;

  beforeAll(async () => {
    const all = await loadEverything();
    index = all.index;
  }, 120_000);

  it("ogni collezione ha metadati completi e id univoci", () => {
    const ids = COLLECTIONS.map((collection) => collection.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const collection of COLLECTIONS) {
      expect(collection.title.length, collection.id).toBeGreaterThan(0);
      expect(collection.description.length, collection.id).toBeGreaterThan(10);
      expect(collection.icon.length, collection.id).toBeGreaterThan(0);
      expect(collection.accent, collection.id).toContain("from-");
      expect(getCollection(collection.id)).toBe(collection);
    }
  });

  it("ogni mappa tematica seleziona un insieme ampio e coerente", () => {
    const thematic = listCollections("thematic");
    expect(thematic.length).toBeGreaterThanOrEqual(6);
    for (const collection of thematic) {
      const matches = selectLocations(index, collection.criteria);
      expect(matches.length, collection.id).toBeGreaterThanOrEqual(20);
      for (const location of matches.slice(0, 25)) {
        expect(isValidCoordinates(location.coordinates)).toBe(true);
      }
    }
  });

  it("i criteri delle mappe tematiche filtrano davvero (non riportano tutto)", () => {
    for (const collection of listCollections("thematic")) {
      const matches = selectLocations(index, collection.criteria);
      expect(matches.length, collection.id).toBeLessThan(index.locations.length);
    }
  });

  it("ogni pacchetto di sfida è giocabile: round disponibili e coerenti col piano", () => {
    const challenges = listCollections("challenge").filter(isChallengePack);
    expect(challenges.length).toBeGreaterThanOrEqual(6);
    for (const challenge of challenges) {
      expect(challenge.rounds, challenge.id).toBeGreaterThanOrEqual(5);
      expect(challenge.recommendedMode, challenge.id).toBeTruthy();
      const pool = selectLocations(index, challenge.criteria);
      expect(pool.length, challenge.id).toBeGreaterThanOrEqual(challenge.rounds * 3);

      const rounds = generateRounds(pool, challenge.rounds, challenge.plan, {
        rng: createSeededRng(challenge.id.length * 17 + challenge.rounds),
      });
      expect(rounds.length, challenge.id).toBe(challenge.rounds);
      expect(new Set(rounds.map((round) => round.id)).size, challenge.id).toBe(rounds.length);

      // I luoghi estratti soddisfano i criteri della sfida.
      const filtered = selectLocations(index, challenge.criteria).map((location) => location.id);
      for (const round of rounds) expect(filtered, challenge.id).toContain(round.id);
    }
  });

  it("i piani delle sfide dichiarano vincoli geografici sensati", () => {
    for (const challenge of listCollections("challenge").filter(isChallengePack)) {
      const { plan } = challenge;
      if (plan.minSeparationKm !== undefined) {
        expect(plan.minSeparationKm, challenge.id).toBeGreaterThanOrEqual(40);
      }
      if (plan.difficultyMix) {
        const total = ([1, 2, 3] as DifficultyLevel[]).reduce(
          (sum, level) => sum + (plan.difficultyMix?.[level] ?? 0),
          0
        );
        expect(total, challenge.id).toBeGreaterThan(0);
      }
    }
  });

  it("una sfida ripetuta più volte non esaurisce la varietà", () => {
    // Si prende la sfida con il parco luoghi più ampio: è lì che la varietà
    // conta davvero (le capitali europee sono ~40 e si ripetono per forza).
    const challenges = listCollections("challenge").filter(isChallengePack);
    const challenge = challenges
      .map((item) => ({ item, pool: selectLocations(index, item.criteria) }))
      .sort((a, b) => b.pool.length - a.pool.length)[0].item;
    const pool = selectLocations(index, challenge.criteria);
    const seen = new Set<string>();
    for (let session = 0; session < 12; session++) {
      const rounds = generateRounds(pool, challenge.rounds, challenge.plan, {
        rng: createSeededRng(1000 + session),
      });
      for (const round of rounds) seen.add(round.id);
    }
    // 12 sessioni: si usa buona parte del parco luoghi, senza esaurirlo
    // in poche partite (le ripetizioni restano ampiamente diluite).
    const draws = challenge.rounds * 12;
    expect(seen.size).toBeGreaterThanOrEqual(Math.min(pool.length, draws * 0.5));
    expect(seen.size).toBeLessThanOrEqual(pool.length);
  });
});
