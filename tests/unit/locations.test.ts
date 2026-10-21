import { describe, it, expect } from "vitest";
import { LOCATIONS, getLocationById, getLocationsByContinent } from "@/data/locations";
import { isValidCoordinates, haversineDistanceKm } from "@/lib/game/geo";

describe("dataset delle località (validazione automatica)", () => {
  it("contiene almeno 100 luoghi", () => {
    expect(LOCATIONS.length).toBeGreaterThanOrEqual(100);
  });

  it("tutti gli id sono univoci e stabili (slug)", () => {
    const ids = LOCATIONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("tutte le coordinate sono nei range geografici validi", () => {
    for (const loc of LOCATIONS) {
      expect(isValidCoordinates(loc.coordinates), loc.id).toBe(true);
    }
  });

  it("ogni luogo ha almeno 2 indizi non vuoti e nome/paese valorizzati", () => {
    for (const loc of LOCATIONS) {
      expect(loc.hints.length, loc.id).toBeGreaterThanOrEqual(2);
      for (const hint of loc.hints) {
        expect(hint.trim().length, loc.id).toBeGreaterThan(10);
      }
      expect(loc.name.length, loc.id).toBeGreaterThan(1);
      expect(loc.country.length, loc.id).toBeGreaterThan(1);
      expect([1, 2, 3], loc.id).toContain(loc.difficulty);
    }
  });

  it("tutti i continenti abitati sono rappresentati con almeno 10 luoghi", () => {
    const continents = [
      "europe",
      "asia",
      "africa",
      "north_america",
      "south_america",
      "oceania",
    ] as const;
    for (const c of continents) {
      expect(getLocationsByContinent(c).length, c).toBeGreaterThanOrEqual(10);
    }
  });

  it("tutte le categorie richieste sono rappresentate", () => {
    const categories = new Set(LOCATIONS.map((l) => l.category));
    for (const cat of ["capital", "city", "monument", "nature", "island"]) {
      expect(categories.has(cat as never), cat).toBe(true);
    }
  });

  it("nessuna coppia di obiettivi è a meno di 40 km (round non ambigui)", () => {
    for (let i = 0; i < LOCATIONS.length; i++) {
      for (let j = i + 1; j < LOCATIONS.length; j++) {
        const d = haversineDistanceKm(
          LOCATIONS[i].coordinates,
          LOCATIONS[j].coordinates
        );
        expect(
          d,
          `${LOCATIONS[i].id} ↔ ${LOCATIONS[j].id}: ${d.toFixed(1)} km`
        ).toBeGreaterThan(40);
      }
    }
  });

  it("getLocationById trova i luoghi per id", () => {
    expect(getLocationById("roma")?.name).toBe("Roma");
    expect(getLocationById("inesistente")).toBeUndefined();
  });

  it("coordinate di controllo: Roma e Tokyo corrispondono ai riferimenti ufficiali", () => {
    const Roma = getLocationById("roma")!;
    expect(Roma.coordinates.lat).toBeCloseTo(41.9028, 3);
    expect(Roma.coordinates.lng).toBeCloseTo(12.4964, 3);
    const Tokyo = getLocationById("tokyo")!;
    expect(Tokyo.coordinates.lat).toBeCloseTo(35.6762, 3);
    expect(Tokyo.coordinates.lng).toBeCloseTo(139.6503, 3);
  });
});
