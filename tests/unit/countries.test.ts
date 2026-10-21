import { describe, it, expect } from "vitest";
import { COUNTRIES, getCountryById, getCountriesByContinent, getAllCapitals } from "@/data/countries";

describe("COUNTRIES dataset", () => {
  it("contiene almeno 40 paesi", () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(40);
  });

  it("ogni paese ha tutti i campi obbligatori", () => {
    for (const country of COUNTRIES) {
      expect(country.id).toBeTruthy();
      expect(country.name).toBeTruthy();
      expect(country.capital).toBeTruthy();
      expect(country.continent).toBeTruthy();
      expect(country.flag).toBeTruthy();
      expect(country.coordinates).toBeDefined();
      expect(country.coordinates.lat).toBeGreaterThanOrEqual(-90);
      expect(country.coordinates.lat).toBeLessThanOrEqual(90);
      expect(country.coordinates.lng).toBeGreaterThanOrEqual(-180);
      expect(country.coordinates.lng).toBeLessThanOrEqual(180);
      expect(country.population).toBeGreaterThan(0);
      expect(country.area).toBeGreaterThan(0);
      expect(country.iso).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("gli ID sono unici", () => {
    const ids = new Set(COUNTRIES.map((c) => c.id));
    expect(ids.size).toBe(COUNTRIES.length);
  });

  it("gli ISO code sono unici", () => {
    const isos = new Set(COUNTRIES.map((c) => c.iso));
    expect(isos.size).toBe(COUNTRIES.length);
  });

  it("copre tutti i continenti abitati", () => {
    const continents = new Set(COUNTRIES.map((c) => c.continent));
    expect(continents.has("europe")).toBe(true);
    expect(continents.has("asia")).toBe(true);
    expect(continents.has("africa")).toBe(true);
    expect(continents.has("north_america")).toBe(true);
    expect(continents.has("south_america")).toBe(true);
    expect(continents.has("oceania")).toBe(true);
  });
});

describe("getCountryById", () => {
  it("trova un paese esistente", () => {
    const country = getCountryById("it");
    expect(country).toBeDefined();
    expect(country?.name).toBe("Italia");
  });

  it("restituisce undefined per ID non esistente", () => {
    const country = getCountryById("nonexistent");
    expect(country).toBeUndefined();
  });
});

describe("getCountriesByContinent", () => {
  it("filtra per continente", () => {
    const european = getCountriesByContinent("europe");
    expect(european.length).toBeGreaterThan(0);
    for (const country of european) {
      expect(country.continent).toBe("europe");
    }
  });

  it("restituisce array vuoto per continente senza paesi", () => {
    const antarctic = getCountriesByContinent("antarctica");
    expect(antarctic).toHaveLength(0);
  });
});

describe("getAllCapitals", () => {
  it("restituisce una lista di capitali", () => {
    const capitals = getAllCapitals();
    expect(capitals.length).toBe(COUNTRIES.length);
    expect(capitals).toContain("Roma");
    expect(capitals).toContain("Parigi");
  });
});
