import { describe, it, expect } from "vitest";
import {
  calculateLevel,
  formatNumber,
  continentLabel,
  difficultyLabel,
  quizTypeLabel,
} from "@/lib/utils";

describe("calculateLevel", () => {
  it("restituisce livello 1 per 0 XP", () => {
    const info = calculateLevel(0);
    expect(info.level).toBe(1);
    expect(info.currentXp).toBe(0);
  });

  it("aumenta di livello con XP sufficiente", () => {
    // Livello 1 richiede 100 XP (100 * 1^1.5)
    const info = calculateLevel(100);
    expect(info.level).toBe(2);
  });

  it("il progresso è tra 0 e 100", () => {
    const info = calculateLevel(50);
    expect(info.progress).toBeGreaterThan(0);
    expect(info.progress).toBeLessThanOrEqual(100);
  });

  it("xpForNextLevel è sempre positivo", () => {
    const info = calculateLevel(500);
    expect(info.xpForNextLevel).toBeGreaterThan(0);
  });

  it("non entra in loop con XP non finiti o negativi (storage corrotto)", () => {
    // Regressione: `calculateLevel(NaN)` non terminava mai e bloccava
    // l'intera pagina (Header, profilo, classifiche).
    for (const xp of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -500]) {
      const info = calculateLevel(xp);
      expect(info.level).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(info.progress)).toBe(true);
      expect(info.progress).toBeGreaterThanOrEqual(0);
      expect(info.progress).toBeLessThanOrEqual(100);
    }
  });

  it("si ferma al livello massimo supportato dal server (200)", () => {
    const info = calculateLevel(Number.MAX_SAFE_INTEGER);
    expect(info.level).toBe(200);
    expect(info.progress).toBeLessThanOrEqual(100);
  });
});

describe("formatNumber", () => {
  it("formatta numeri piccoli", () => {
    expect(formatNumber(42)).toBe("42");
  });

  it("formatta numeri con separatore migliaia", () => {
    const formatted = formatNumber(1234567);
    // Il formato italiano usa il punto come separatore migliaia
    expect(formatted).toContain("234");
    expect(formatted).toContain("567");
  });
});

describe("continentLabel", () => {
  it("traduce i continenti in italiano", () => {
    expect(continentLabel("europe")).toBe("Europa");
    expect(continentLabel("asia")).toBe("Asia");
    expect(continentLabel("africa")).toBe("Africa");
  });

  it("gestisce valori sconosciuti", () => {
    expect(continentLabel("unknown")).toBe("unknown");
  });
});

describe("difficultyLabel", () => {
  it("traduce le difficoltà", () => {
    expect(difficultyLabel("easy")).toBe("Facile");
    expect(difficultyLabel("medium")).toBe("Medio");
    expect(difficultyLabel("hard")).toBe("Difficile");
  });
});

describe("quizTypeLabel", () => {
  it("traduce i tipi di quiz", () => {
    expect(quizTypeLabel("capital")).toBe("Capitali");
    expect(quizTypeLabel("flag")).toBe("Bandiere");
    expect(quizTypeLabel("continent")).toBe("Continenti");
    expect(quizTypeLabel("population")).toBe("Popolazione");
    // Tipo non supportato dal server: etichetta di fallback onesta.
    expect(quizTypeLabel("location")).toBe("location");
  });
});
