import { describe, it, expect } from "vitest";
import {
  calculateLevel,
  calculatePoints,
  generateRoomCode,
  shuffleArray,
  formatNumber,
  latLngToVector3,
  haversineDistance,
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
});

describe("calculatePoints", () => {
  it("restituisce 0 per risposta sbagliata", () => {
    expect(calculatePoints(false, 5, 30)).toBe(0);
  });

  it("restituisce punti base per risposta corretta", () => {
    const points = calculatePoints(true, 15, 30);
    expect(points).toBeGreaterThanOrEqual(100);
    expect(points).toBeLessThanOrEqual(200);
  });

  it("dà più punti per risposte veloci", () => {
    const fast = calculatePoints(true, 2, 30);
    const slow = calculatePoints(true, 25, 30);
    expect(fast).toBeGreaterThan(slow);
  });

  it("punti massimi a tempo 0", () => {
    const points = calculatePoints(true, 0, 30);
    expect(points).toBe(200); // 100 base + 100 bonus
  });
});

describe("generateRoomCode", () => {
  it("genera un codice di 6 caratteri", () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(6);
  });

  it("contiene solo caratteri validi", () => {
    const validChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = generateRoomCode();
    for (const char of code) {
      expect(validChars).toContain(char);
    }
  });

  it("genera codici diversi", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateRoomCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("shuffleArray", () => {
  it("restituisce un array della stessa lunghezza", () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffleArray(arr);
    expect(shuffled).toHaveLength(arr.length);
  });

  it("non modifica l'array originale", () => {
    const arr = [1, 2, 3, 4, 5];
    const original = [...arr];
    shuffleArray(arr);
    expect(arr).toEqual(original);
  });

  it("contiene gli stessi elementi", () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffleArray(arr);
    expect(shuffled.sort()).toEqual(arr.sort());
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

describe("latLngToVector3", () => {
  it("converte coordinate in vettore 3D", () => {
    const result = latLngToVector3(0, 0, 1);
    expect(typeof result[0]).toBe("number");
    expect(typeof result[1]).toBe("number");
    expect(typeof result[2]).toBe("number");
  });

  it("il polo nord ha y positivo", () => {
    const result = latLngToVector3(90, 0, 1);
    expect(result[1]).toBeCloseTo(1, 1);
  });

  it("il polo sud ha y negativo", () => {
    const result = latLngToVector3(-90, 0, 1);
    expect(result[1]).toBeCloseTo(-1, 1);
  });
});

describe("haversineDistance", () => {
  it("la distanza tra lo stesso punto è 0", () => {
    const dist = haversineDistance(41.9, 12.5, 41.9, 12.5);
    expect(dist).toBeCloseTo(0, 1);
  });

  it("Roma-Milano è circa 477 km", () => {
    const dist = haversineDistance(41.9, 12.5, 45.46, 9.19);
    expect(dist).toBeGreaterThan(400);
    expect(dist).toBeLessThan(600);
  });

  it("distanze simmetriche", () => {
    const d1 = haversineDistance(41.9, 12.5, 48.9, 2.35);
    const d2 = haversineDistance(48.9, 2.35, 41.9, 12.5);
    expect(d1).toBeCloseTo(d2, 1);
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
    expect(quizTypeLabel("location")).toBe("Posizione");
  });
});
