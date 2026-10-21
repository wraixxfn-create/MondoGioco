import { describe, it, expect } from "vitest";
import {
  latLngToVector3,
  vector3ToLatLng,
  haversineDistanceKm,
  calculateScore,
  normalizeLng,
  isValidCoordinates,
  formatDistance,
  distanceVerdict,
  greatCircleMidpoint,
  greatCircleArcPoints,
  MAX_ROUND_SCORE,
  PERFECT_TOLERANCE_KM,
} from "@/lib/game/geo";
import { LOCATIONS } from "@/data/locations";

describe("conversione coordinate ↔ vettore 3D (picking sul globo)", () => {
  it("round-trip esatto per tutti i luoghi del dataset", () => {
    for (const loc of LOCATIONS) {
      const [x, y, z] = latLngToVector3(loc.coordinates.lat, loc.coordinates.lng, 1);
      const back = vector3ToLatLng({ x, y, z });
      expect(back.lat, loc.id).toBeCloseTo(loc.coordinates.lat, 6);
      // La longitudine può differire solo per la normalizzazione ±180.
      const diff = Math.abs(normalizeLng(back.lng - loc.coordinates.lng));
      expect(diff, loc.id).toBeLessThan(1e-6);
    }
  });

  it("round-trip su una griglia fitta di lat/lng (simula click ovunque)", () => {
    for (let lat = -85; lat <= 85; lat += 7.3) {
      for (let lng = -179; lng <= 179; lng += 11.7) {
        const [x, y, z] = latLngToVector3(lat, lng, 1);
        const back = vector3ToLatLng({ x, y, z });
        expect(back.lat).toBeCloseTo(lat, 5);
        expect(Math.abs(normalizeLng(back.lng - lng))).toBeLessThan(1e-5);
      }
    }
  });

  it("punto 3D noto → Roma (coordinate note)", () => {
    // Roma: il punto 3D è costruito dalle coordinate reali,
    // l'inversa deve restituire le stesse coordinate.
    const Roma = latLngToVector3(41.9, 12.5, 1);
    const back = vector3ToLatLng({ x: Roma[0], y: Roma[1], z: Roma[2] });
    expect(back.lat).toBeCloseTo(41.9, 6);
    expect(back.lng).toBeCloseTo(12.5, 6);
  });

  it("gestisce poli ed equatore", () => {
    const nord = vector3ToLatLng({ x: 0, y: 1, z: 0 });
    expect(nord.lat).toBeCloseTo(90, 6);
    const sud = vector3ToLatLng({ x: 0, y: -1, z: 0 });
    expect(sud.lat).toBeCloseTo(-90, 6);
    const [x, y, z] = latLngToVector3(0, 0, 1);
    expect(y).toBeCloseTo(0, 10);
    const back = vector3ToLatLng({ x, y, z });
    expect(back.lat).toBeCloseTo(0, 6);
    expect(back.lng).toBeCloseTo(0, 6);
  });

  it("è invariante alla scala del vettore (raggio arbitrario)", () => {
    const a = vector3ToLatLng({ x: 2, y: 3, z: -1 });
    const b = vector3ToLatLng({ x: 0.02, y: 0.03, z: -0.01 });
    expect(a.lat).toBeCloseTo(b.lat, 10);
    expect(a.lng).toBeCloseTo(b.lng, 10);
  });

  it("origine (0,0,0) non produce NaN", () => {
    const res = vector3ToLatLng({ x: 0, y: 0, z: 0 });
    expect(Number.isFinite(res.lat)).toBe(true);
    expect(Number.isFinite(res.lng)).toBe(true);
  });
});

describe("normalizeLng", () => {
  it.each([
    [0, 0],
    [190, -170],
    [-190, 170],
    [180, 180],
    [-180, 180],
    [540, 180],
    [720, 0],
    [-540, 180],
    [181, -179],
  ])("normalizeLng(%d) = %d", (input, expected) => {
    expect(normalizeLng(input)).toBeCloseTo(expected, 10);
  });
});

describe("Haversine — distanze note tra città reali", () => {
  const Roma = { lat: 41.9028, lng: 12.4964 };
  const Parigi = { lat: 48.8566, lng: 2.3522 };
  const newYork = { lat: 40.7128, lng: -74.006 };
  const losAngeles = { lat: 34.0522, lng: -118.2437 };
  const Sydney = { lat: -33.8688, lng: 151.2093 };

  it("Roma ≈ 1.105 km", () => {
    expect(haversineDistanceKm(Roma, Parigi)).toBeCloseTo(1105, -1); // ±5 km
  });

  it("New York → Los Angeles ≈ 3.936 km", () => {
    expect(haversineDistanceKm(newYork, losAngeles)).toBeCloseTo(3936, -1);
  });

  it("distanza nulla verso se stessi", () => {
    expect(haversineDistanceKm(Roma, Roma)).toBe(0);
  });

  it("è simmetrica", () => {
    expect(haversineDistanceKm(Roma, Sydney)).toBeCloseTo(
      haversineDistanceKm(Sydney, Roma),
      9
    );
  });

  it("antipodi ≈ mezza circonferenza terrestre (π·R)", () => {
    const d = haversineDistanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(d).toBeCloseTo(Math.PI * 6371, 0);
  });

  it("Roma → Sydney ≈ 16.300 km (gestione dateline implicita)", () => {
    const d = haversineDistanceKm(Roma, Sydney);
    expect(d).toBeGreaterThan(16200);
    expect(d).toBeLessThan(16400);
  });

  it("1° di longitudine all'equatore ≈ 111,2 km", () => {
    expect(haversineDistanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.19, 1);
  });
});

describe("calculateScore — formula documentata e limiti", () => {
  it("distanza 0 → punteggio massimo", () => {
    expect(calculateScore(0)).toBe(MAX_ROUND_SCORE);
  });

  it("tutta la tolleranza «perfetta» dà il massimo", () => {
    expect(calculateScore(PERFECT_TOLERANCE_KM)).toBe(MAX_ROUND_SCORE);
    expect(calculateScore(10)).toBe(MAX_ROUND_SCORE);
  });

  it("è monotona non crescente all'aumentare della distanza", () => {
    let prev = Infinity;
    for (let d = 0; d <= 20016; d += 137) {
      const s = calculateScore(d);
      expect(s).toBeLessThanOrEqual(prev);
      prev = s;
    }
  });

  it("resta sempre entro [0, 5000]", () => {
    for (let d = 0; d <= 25000; d += 61) {
      const s = calculateScore(d);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(MAX_ROUND_SCORE);
    }
  });

  it("metà punteggio intorno a 1.386 km (2000·ln2)", () => {
    expect(calculateScore(2000 * Math.LN2)).toBeCloseTo(2500, -1);
  });

  it("agli antipodi tende a ~0 punti", () => {
    expect(calculateScore(20015)).toBeLessThan(5);
  });

  it("input non validi → 0 punti, mai NaN", () => {
    expect(calculateScore(NaN)).toBe(0);
    expect(calculateScore(Infinity)).toBe(0);
    expect(calculateScore(-50)).toBe(0);
  });

  it("è deterministica: stessa distanza, stesso punteggio", () => {
    expect(calculateScore(1234.5)).toBe(calculateScore(1234.5));
  });
});

describe("isValidCoordinates / formatDistance / distanceVerdict", () => {
  it("valida i range geografici", () => {
    expect(isValidCoordinates({ lat: 0, lng: 0 })).toBe(true);
    expect(isValidCoordinates({ lat: 90, lng: 180 })).toBe(true);
    expect(isValidCoordinates({ lat: 90.1, lng: 0 })).toBe(false);
    expect(isValidCoordinates({ lat: 0, lng: -181 })).toBe(false);
    expect(isValidCoordinates({ lat: NaN, lng: 0 })).toBe(false);
  });

  it("formatta le distanze in italiano", () => {
    expect(formatDistance(0.4)).toBe("400 m");
    expect(formatDistance(12.3)).toBe("12 km");
    expect(formatDistance(1105.6)).toBe("1.106 km");
  });

  it("i verdetti coprono tutte le fasce", () => {
    expect(distanceVerdict(0)).toContain("pieno");
    expect(distanceVerdict(800)).toBeTruthy();
    expect(distanceVerdict(19000)).toContain("antipodi");
  });
});

describe("archi di cerchio massimo (linea risposta→destinazione)", () => {
  it("il midpoint Roma-Parisi sta a metà strada", () => {
    const Roma = { lat: 41.9028, lng: 12.4964 };
    const Parigi = { lat: 48.8566, lng: 2.3522 };
    const mid = greatCircleMidpoint(Roma, Parigi);
    const d1 = haversineDistanceKm(Roma, mid);
    const d2 = haversineDistanceKm(mid, Parigi);
    expect(d1).toBeCloseTo(d2, 1);
    expect(d1 + d2).toBeCloseTo(haversineDistanceKm(Roma, Parigi), 0);
  });

  it("l'arco ha il numero atteso di punti, tutti fuori dalla sfera unitaria", () => {
    const pts = greatCircleArcPoints({ lat: 0, lng: 0 }, { lat: 40, lng: 60 }, 24);
    expect(pts).toHaveLength(25);
    for (const [x, y, z] of pts) {
      expect(Math.sqrt(x ** 2 + y ** 2 + z ** 2)).toBeGreaterThanOrEqual(1.0);
    }
    // gli estremi corrispondono a partenza e arrivo
    const start = vector3ToLatLng({ x: pts[0][0], y: pts[0][1], z: pts[0][2] });
    expect(start.lat).toBeCloseTo(0, 4);
    expect(start.lng).toBeCloseTo(0, 4);
    const end = vector3ToLatLng({ x: pts[24][0], y: pts[24][1], z: pts[24][2] });
    expect(end.lat).toBeCloseTo(40, 4);
    expect(end.lng).toBeCloseTo(60, 4);
  });
});
