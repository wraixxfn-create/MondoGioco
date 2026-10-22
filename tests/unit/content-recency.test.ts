import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  SeenHistory,
  SEEN_STORAGE_KEY,
  MAX_TRACKED_LOCATIONS,
  getSeenHistory,
  resetSeenHistory,
} from "@/lib/content/recency";
import { recencyWeight, generateRounds } from "@/lib/content/selection";
import { CONTENT_SCHEMA_VERSION } from "@/data/content/schema";
import { createSeededRng } from "@/lib/game/engine";

describe("storico dei luoghi già proposti", () => {
  beforeEach(() => {
    localStorage.clear();
    resetSeenHistory();
  });
  afterEach(() => {
    localStorage.clear();
    resetSeenHistory();
  });

  it("parte da una sessione vuota e registra i luoghi visti", () => {
    const history = new SeenHistory();
    expect(history.size).toBe(0);
    expect(history.ageOf("roma")).toBeUndefined();

    history.markSeen(["roma", "parigi"]);
    expect(history.size).toBe(2);
    expect(history.ageOf("roma")).toBe(0);
    expect(history.entries().get("parigi")).toBe(history.sessionIndex);
  });

  it("fa invecchiare i luoghi a ogni nuova sessione", () => {
    const history = new SeenHistory();
    history.markSeen(["roma"]);
    const before = history.sessionIndex;
    const next = history.startSession();
    expect(next).toBe(before + 1);
    expect(history.ageOf("roma")).toBe(1);
    history.startSession();
    history.startSession();
    expect(history.ageOf("roma")).toBe(3);
    expect(recencyWeight(history.ageOf("roma"))).toBeCloseTo(0.45);
  });

  it("persiste fra le istanze (localStorage)", () => {
    const first = new SeenHistory();
    first.startSession();
    first.markSeen(["berlino", "madrid"]);

    const second = new SeenHistory();
    expect(second.sessionIndex).toBe(first.sessionIndex);
    expect(second.ageOf("berlino")).toBe(0);
    expect(second.entries().get("madrid")).toBe(first.sessionIndex);
  });

  it("funziona anche senza storage disponibile", () => {
    const history = new SeenHistory({ storage: null });
    history.markSeen(["oslo"]);
    history.startSession();
    expect(history.ageOf("oslo")).toBe(1);
  });

  it("ignora dati corrotti o di un'altra versione dello schema", () => {
    localStorage.setItem(SEEN_STORAGE_KEY, "{ non json");
    expect(new SeenHistory().size).toBe(0);

    localStorage.setItem(
      SEEN_STORAGE_KEY,
      JSON.stringify({ version: CONTENT_SCHEMA_VERSION + 99, session: 12, entries: { roma: 5 } })
    );
    const history = new SeenHistory();
    expect(history.size).toBe(0);
    expect(history.sessionIndex).toBe(1);
  });

  it("mantiene al massimo MAX_TRACKED_LOCATIONS voci", () => {
    const history = new SeenHistory({ storage: null });
    const ids = Array.from({ length: MAX_TRACKED_LOCATIONS + 250 }, (_, index) => `luogo-${index}`);
    for (const id of ids) {
      history.markSeen([id]);
      history.startSession();
    }
    expect(history.size).toBeLessThanOrEqual(MAX_TRACKED_LOCATIONS);
    expect(history.size).toBeGreaterThan(MAX_TRACKED_LOCATIONS * 0.8);
    // Le voci più vecchie sono state eliminate, le ultime restano.
    const last = `luogo-${MAX_TRACKED_LOCATIONS + 249}`;
    expect(history.ageOf(last)).toBe(1);
    expect(history.ageOf("luogo-0")).toBeUndefined();
  });

  it("si azzera su richiesta", () => {
    const history = new SeenHistory();
    history.markSeen(["tokio"]);
    history.clear();
    expect(history.size).toBe(0);
    expect(localStorage.getItem(SEEN_STORAGE_KEY)).toBeNull();
  });

  it("condivide una sola istanza per la sessione del browser", () => {
    const first = getSeenHistory();
    const second = getSeenHistory();
    expect(first).toBe(second);
  });

  it("riduce la ripetizione fra sessioni consecutive (integrazione)", () => {
    const history = new SeenHistory();
    const pool = Array.from({ length: 400 }, (_, index) => ({
      id: `luogo-${index}`,
      name: `Luogo ${index}`,
      country: "Italia",
      countryCode: "IT",
      continent: "europe" as const,
      category: "city",
      difficulty: 2 as const,
      coordinates: { lat: 40 + index * 0.05, lng: 10 + index * 0.05 },
      themes: [],
      sourceId: "curated",
      hints: ["Primo indizio abbastanza lungo.", "Secondo indizio abbastanza lungo."],
      packId: "test",
      quality: { coordinateAccuracyM: 15, geoCheck: "inside" as const, reviewed: true },
    }));

    const firstSession = generateRounds(
      pool,
      50,
      { minSeparationKm: 0 },
      { rng: createSeededRng(5) }
    );
    history.markSeen(firstSession.map((round) => round.id));
    history.startSession();

    const secondSession = generateRounds(
      pool,
      50,
      { minSeparationKm: 0 },
      {
        rng: createSeededRng(6),
        sessionIndex: history.sessionIndex,
        recency: history.entries(),
      }
    );
    const repeated = secondSession.filter((round) =>
      firstSession.some((old) => old.id === round.id)
    );
    expect(repeated.length).toBeLessThanOrEqual(5);
    expect(secondSession.length).toBe(50);
  });
});
