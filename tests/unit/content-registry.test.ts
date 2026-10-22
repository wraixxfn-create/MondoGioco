import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  listPackDescriptors,
  loadPack,
  loadPacks,
  loadCorePacks,
  packsForCriteria,
  isPackLoaded,
  loadedBytes,
  resetPackCache,
  getPackDescriptor,
} from "@/lib/content/registry";
import { registerCategory, getCategory } from "@/lib/content/categories";
import { registerTheme, getTheme } from "@/lib/content/themes";
import { buildIndex, selectLocations } from "@/lib/content/catalog";
import { generateRounds } from "@/lib/content/selection";
import { createSeededRng } from "@/lib/game/engine";
import { hydrateCuratedRow } from "@/lib/content/hydrate";
import type { CuratedRow } from "@/data/content/schema";

describe("registro dei pacchetti e caricamento on demand", () => {
  beforeEach(() => resetPackCache());
  afterEach(() => resetPackCache());

  it("elenca i pacchetti con metadati completi", () => {
    const packs = listPackDescriptors();
    expect(packs.length).toBeGreaterThanOrEqual(11);
    for (const pack of packs) {
      expect(pack.id.length, pack.id).toBeGreaterThan(0);
      expect(pack.title.length, pack.id).toBeGreaterThan(0);
      expect(pack.description.length, pack.id).toBeGreaterThan(10);
      expect(pack.sourceIds.length, pack.id).toBeGreaterThan(0);
      expect(pack.approxBytes, pack.id).toBeGreaterThan(0);
    }
    expect(packs.filter((pack) => pack.curated && pack.core).length).toBe(5);
    expect(packs.filter((pack) => !pack.curated).every((pack) => !pack.core)).toBe(true);
  });

  it("carica solo i pacchetti richiesti (niente download inutili)", async () => {
    const onlyEurope = packsForCriteria({ continents: ["europe"] });
    expect(onlyEurope).toContain("cities-europe");
    expect(onlyEurope).not.toContain("cities-asia");
    expect(onlyEurope).not.toContain("cities-oceania");
    // I curati sono sempre inclusi: pesano poche decine di kB.
    expect(onlyEurope.filter((id) => id.startsWith("curated-")).length).toBe(5);

    await loadPacks(onlyEurope);
    expect(isPackLoaded("cities-europe")).toBe(true);
    expect(isPackLoaded("cities-asia")).toBe(false);
    expect(loadedBytes()).toBeLessThan(300_000);

    await loadPack("cities-asia");
    expect(isPackLoaded("cities-asia")).toBe(true);
    expect(loadedBytes()).toBeGreaterThan(300_000);
  });

  it("i pacchetti generati portano indizi derivati dai dati e qualità verificata", async () => {
    const pack = await loadPack("cities-europe");
    expect(pack.locations.length).toBeGreaterThan(200);
    for (const location of pack.locations.slice(0, 50)) {
      expect(location.hints.length, location.id).toBeGreaterThanOrEqual(2);
      expect(
        location.hints.every((hint) => hint.length > 10),
        location.id
      ).toBe(true);
      expect(location.sourceId, location.id).toBe("geonames");
      expect(location.quality.reviewed, location.id).toBe(false);
      expect(location.quality.geoCheck, location.id).not.toBe("outside");
      if (location.category === "capital") {
        expect(location.themes, location.id).toContain("capitals");
      }
    }
    expect(pack.locations.some((location) => location.category === "capital")).toBe(true);
    // Ogni città ha almeno un suggerimento che nomina il paese o la zona.
    expect(pack.locations.every((location) => location.hints.join(" ").length > 20)).toBe(true);
  });

  it("memoizza il caricamento (seconda chiamata sincrona)", async () => {
    const first = await loadPack("cities-africa");
    const second = await loadPack("cities-africa");
    expect(second).toBe(first);
  });

  it("rifiuta un pacchetto sconosciuto", async () => {
    await expect(loadPack("pacchetto-inesistente")).rejects.toThrow(/sconosciuto/);
    expect(getPackDescriptor("pacchetto-inesistente")).toBeUndefined();
  });

  it("l'esperienza di base usa solo i pacchetti curati", async () => {
    const core = await loadCorePacks();
    expect(core.length).toBe(5);
    expect(core.every((pack) => pack.curated)).toBe(true);
    const locations = core.flatMap((pack) => pack.locations);
    expect(locations.length).toBeGreaterThan(250);
    expect(locations.every((location) => location.quality.reviewed)).toBe(true);
  });

  it("supporta una categoria nuova senza modifiche al motore", async () => {
    registerCategory({
      id: "glacier",
      label: "Ghiacciaio",
      plural: "Ghiacciai",
      icon: "🧊",
      description: "Ghiacciai e calotte (categoria introdotta da un pacchetto).",
      hintStyle: "point",
    });
    registerTheme({
      id: "ice",
      label: "Ghiaccio",
      icon: "🧊",
      description: "Coperto di ghiaccio.",
    });

    const row: CuratedRow = [
      "ghiacciaio-di-prova",
      "Ghiacciaio di prova",
      "Norvegia",
      "NO",
      "europe",
      "glacier",
      3,
      61.6,
      7.2,
      ["ice"],
      [
        "Un ghiacciaio di prova nel nord Europa.",
        "Si trova in Norvegia, entro un parco nazionale.",
      ],
    ];
    const location = hydrateCuratedRow(row, "pack-di-prova", "curated");

    expect(getCategory("glacier").label).toBe("Ghiacciaio");
    expect(getTheme("ice").label).toBe("Ghiaccio");

    // Filtri e selezione funzionano con la categoria sconosciuta al motore.
    const index = buildIndex([location]);
    const found = selectLocations(index, { categories: ["glacier"] });
    expect(found.length).toBe(1);
    const rounds = generateRounds(found, 1, {}, { rng: createSeededRng(1) });
    expect(rounds[0]?.category).toBe("glacier");
  });

  it("le etichette di categorie sconosciute hanno un fallback leggibile", () => {
    expect(getCategory("parco-nazionale").label).toBe("Parco nazionale");
    expect(getCategory("parco-nazionale").icon).toBe("📍");
    expect(getTheme("foresta-pluviale").label).toBe("Foresta pluviale");
  });
});
