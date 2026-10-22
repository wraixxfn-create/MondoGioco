import { describe, it, expect, beforeAll } from "vitest";
import type { HydratedLocation } from "@/data/content/schema";
import { validateLocations, errorsOnly, summarizeIssues } from "@/lib/content/quality";
import { DATA_SOURCES, getSource } from "@/data/content/sources";
import { getCategory, listCategories, registerCategory } from "@/lib/content/categories";
import { getTheme } from "@/lib/content/themes";
import { isValidCoordinates } from "@/lib/game/geo";
import { CONTENT_VERSION } from "@/lib/content/version";
import { countBy, loadEverything } from "./content-testkit";

/**
 * Validazione del dataset completo: è il "cancello" che impedisce a dati
 * scorretti (coordinate inventate, duplicati, metadati mancanti, fonti
 * non dichiarate) di arrivare nel gioco.
 */
describe("dataset dei contenuti geografici", () => {
  let all: Awaited<ReturnType<typeof loadEverything>>;

  beforeAll(async () => {
    all = await loadEverything();
  }, 120_000);

  it("carica migliaia di luoghi da più pacchetti", () => {
    expect(all.packs.length).toBeGreaterThanOrEqual(10);
    expect(all.locations.length).toBeGreaterThan(3_000);
    expect(all.packs.every((pack) => pack.version.length > 0)).toBe(true);
    expect(all.packs.every((pack) => pack.locations.length > 0)).toBe(true);
  });

  it("versiona i contenuti", () => {
    expect(CONTENT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    const ids = all.packs.map((pack) => pack.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("supera tutti i controlli di qualità (errori = 0)", () => {
    const issues = errorsOnly(validateLocations(all.locations));
    expect(issues.map((issue) => `${issue.code}: ${issue.message}`).slice(0, 10)).toEqual([]);
  });

  it("non segnala categorie o temi sconosciuti", () => {
    const issues = validateLocations(all.locations).filter(
      (issue) => issue.code === "unknown-category" || issue.code === "unknown-theme"
    );
    expect(issues.map((issue) => issue.message)).toEqual([]);
  });

  it("ogni record dichiara una fonte presente nel registro", () => {
    const known = new Set(DATA_SOURCES.map((source) => source.id));
    for (const location of all.locations) {
      expect(known.has(location.sourceId), `${location.id} → ${location.sourceId}`).toBe(true);
      expect(getSource(location.sourceId)).toBeDefined();
    }
    for (const source of DATA_SOURCES) {
      expect(source.attribution.length, source.id).toBeGreaterThan(10);
      expect(source.license.length, source.id).toBeGreaterThan(2);
      expect(source.licenseUrl, source.id).toMatch(/^https:\/\//);
    }
  });

  it("tutte le coordinate sono valide e distinte", () => {
    for (const location of all.locations) {
      expect(isValidCoordinates(location.coordinates), location.id).toBe(true);
    }
    const keys = all.locations.map(
      (location) => `${location.coordinates.lat.toFixed(4)},${location.coordinates.lng.toFixed(4)}`
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("copre tutti i continenti abitati con un numero significativo di luoghi", () => {
    const byContinent = countBy(all.locations, (location) => location.continent);
    for (const continent of [
      "europe",
      "asia",
      "africa",
      "north_america",
      "south_america",
      "oceania",
    ]) {
      expect(byContinent[continent] ?? 0, continent).toBeGreaterThanOrEqual(100);
    }
  });

  it("copre le categorie richieste dal progetto", () => {
    const byCategory = countBy(all.locations, (location) => location.category);
    for (const category of [
      "capital",
      "city",
      "monument",
      "mountain",
      "river",
      "lake",
      "island",
      "historic",
      "nature",
    ]) {
      expect(byCategory[category] ?? 0, category).toBeGreaterThan(0);
    }
    expect(byCategory.capital).toBeGreaterThan(200);
    expect(byCategory.city).toBeGreaterThan(1_000);
  });

  it("distribuisce la difficoltà su tutti e tre i livelli", () => {
    const byDifficulty = countBy(all.locations, (location) => String(location.difficulty));
    const total = all.locations.length;
    for (const level of ["1", "2", "3"]) {
      const share = (byDifficulty[level] ?? 0) / total;
      expect(share, `livello ${level}`).toBeGreaterThan(0.1);
      expect(share, `livello ${level}`).toBeLessThan(0.6);
    }
  });

  it("i record curati hanno indizi scritti a mano e revisione umana", () => {
    const curated = all.locations.filter((location) => location.quality.reviewed);
    expect(curated.length).toBeGreaterThan(250);
    for (const location of curated) {
      expect(location.hints.length, location.id).toBeGreaterThanOrEqual(2);
      expect(
        location.hints.every((hint) => hint.trim().length > 10),
        location.id
      ).toBe(true);
      expect(location.sourceId, location.id).toBe("curated");
    }
  });

  it("i record generati hanno indizi derivati dai dati e qualità dichiarata", () => {
    const generated = all.locations.filter((location) => !location.quality.reviewed);
    expect(generated.length).toBeGreaterThan(2_000);
    for (const location of generated) {
      expect(location.hints.length, location.id).toBeGreaterThanOrEqual(2);
      expect(location.sourceId, location.id).toBe("geonames");
      expect(location.population ?? 0, location.id).toBeGreaterThan(0);
      expect(location.quality.coordinateAccuracyM, location.id).toBeLessThanOrEqual(50);
    }
  });

  it("i luoghi generati sono stati verificati punto-entro-confini", () => {
    const generated = all.locations.filter((location) => !location.quality.reviewed);
    const unchecked = generated.filter((location) => location.quality.geoCheck === "unavailable");
    // Soltanto i territori privi di geometria Natural Earth restano non verificati.
    expect(unchecked.length / generated.length).toBeLessThan(0.05);
    expect(generated.filter((location) => location.quality.geoCheck === "outside").length).toBe(0);
  });

  it("i temi sono coerenti con i flag del dataset", () => {
    const capitals = all.locations.filter((location) => location.category === "capital");
    expect(capitals.every((location) => location.themes.includes("capitals"))).toBe(true);
    const coastal = all.locations.filter((location) => location.themes.includes("coastal"));
    expect(coastal.length).toBeGreaterThan(100);
    for (const location of all.locations) {
      for (const theme of location.themes) expect(getTheme(theme).id, location.id).toBe(theme);
    }
  });

  it("le etichette di categoria e tema sono sempre disponibili", () => {
    for (const location of all.locations) {
      expect(getCategory(location.category).label.length, location.id).toBeGreaterThan(0);
    }
    expect(listCategories().length).toBeGreaterThanOrEqual(9);
  });

  it("accetta nuove categorie senza toccare il motore (estendibilità)", () => {
    registerCategory({
      id: "test-category",
      label: "Categoria di prova",
      plural: "Categorie di prova",
      icon: "🧪",
      description: "Usata solo dai test.",
      hintStyle: "point",
    });
    const synthetic: HydratedLocation = {
      id: "test-luogo-1",
      name: "Luogo di prova",
      country: "Italia",
      countryCode: "IT",
      continent: "europe",
      category: "test-category",
      difficulty: 2,
      coordinates: { lat: 43.77, lng: 11.25 },
      themes: ["wonder"],
      sourceId: "curated",
      hints: ["Primo indizio abbastanza lungo.", "Secondo indizio abbastanza lungo."],
      packId: "test",
      quality: { coordinateAccuracyM: 15, geoCheck: "inside", reviewed: true },
    };
    expect(getCategory("test-category").label).toBe("Categoria di prova");
    expect(errorsOnly(validateLocations([synthetic]))).toEqual([]);
  });

  it("rileva i problemi reali (test negativi del validatore)", () => {
    const broken: HydratedLocation = {
      id: "Luogo Errato",
      name: "",
      country: "Italia",
      countryCode: "IT",
      continent: "europa" as never,
      category: "city",
      difficulty: 7 as never,
      coordinates: { lat: 200, lng: 400 },
      themes: [],
      sourceId: "fonte-inesistente",
      hints: ["ok"],
      packId: "test",
      quality: { coordinateAccuracyM: 15, geoCheck: "outside", reviewed: false },
    };
    const codes = summarizeIssues(validateLocations([broken]));
    expect(codes["invalid-id"]).toBe(1);
    expect(codes["missing-name"]).toBe(1);
    expect(codes["invalid-coordinates"]).toBeGreaterThanOrEqual(1);
    expect(codes["invalid-difficulty"]).toBe(1);
    expect(codes["invalid-continent"]).toBe(1);
    expect(codes["unknown-source"]).toBe(1);
    expect(codes["missing-hints"]).toBe(1);
  });
});
