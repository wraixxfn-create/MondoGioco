// ============================================================
// MondoGioco — Matematica geografica pura
// ============================================================
//
// Questo modulo NON dipende da Three.js né dal DOM: contiene solo
// funzioni pure, quindi è completamente testabile con Vitest.
//
// Convenzioni 3D (compatibili con THREE.SphereGeometry):
//   La sfera unitaria di Three.js mappa una texture equirettangolare
//   (longitudine -180..180 sull'asse U, latitudine 90..-90 sull'asse V)
//   in modo tale che la conversione corretta lat/lng -> (x, y, z) sia:
//
//     phi   = (90 - lat) in radianti        (angolo dal polo nord, asse +Y)
//     theta = (lng + 180) in radianti
//     x = -r * sin(phi) * cos(theta)
//     z =  r * sin(phi) * sin(theta)
//     y =  r * cos(phi)
//
//   `vector3ToLatLng` è l'inversa esatta: i test verificano il
//   round-trip per centinaia di coordinate reali e casi limite.

import type { GeoCoordinates } from "@/types";

/** Raggio medio terrestre in km (valore standard IUGG). */
export const EARTH_RADIUS_KM = 6371;

/** Punti massimi assegnabili per un singolo round. */
export const MAX_ROUND_SCORE = 5000;

/**
 * Costante di decay della formula di punteggio, in km.
 * Vedi `calculateScore` per la formula completa.
 */
export const SCORE_DECAY_KM = 2000;

/**
 * Distanza (km) entro la quale una risposta è considerata "perfetta"
 * e riceve comunque il punteggio massimo. Assorbe l'imprecisione
 * inevitabile del tap/click su un globo piccolo.
 */
export const PERFECT_TOLERANCE_KM = 25;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Verifica che una coppia di coordinate sia valida:
 * latitudine in [-90, 90], longitudine in [-180, 180], entrambi finiti.
 */
export function isValidCoordinates(coords: { lat: number; lng: number }): boolean {
  return (
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    coords.lat >= -90 &&
    coords.lat <= 90 &&
    coords.lng >= -180 &&
    coords.lng <= 180
  );
}

/**
 * Normalizza una longitudine qualsiasi nell'intervallo (-180, 180].
 * Esempi: 190 -> -170, -540 -> 180, 720 -> 0.
 */
export function normalizeLng(lng: number): number {
  const wrapped = ((lng + 540) % 360) - 180;
  // ((lng + 540) % 360) è in [0, 360) per input finiti, quindi
  // wrapped è in [-180, 180). Portiamo -180 a 180 per coerenza
  // con l'intervallo (-180, 180].
  return wrapped === -180 ? 180 : wrapped;
}

/**
 * Converte coordinate geografiche in un punto 3D sulla sfera.
 * Vedi l'intestazione del modulo per la convenzione usata.
 * La longitudine viene normalizzata; la latitudine clampata ai poli.
 */
export function latLngToVector3(
  lat: number,
  lng: number,
  radius: number
): [number, number, number] {
  const clampedLat = Math.max(-90, Math.min(90, lat));
  const phi = (90 - clampedLat) * DEG_TO_RAD;
  const theta = (normalizeLng(lng) + 180) * DEG_TO_RAD;
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return [x, y, z];
}

/**
 * Converte un punto 3D (ottenuto dal raycasting sulla sfera) in
 * coordinate geografiche. Inversa esatta di `latLngToVector3`:
 * eventuali errori sono solo di arrotondamento in virgola mobile.
 * Il punto non deve essere l'origine; la distanza dall'origine
 * viene ignorata (si proietta sulla sfera).
 */
export function vector3ToLatLng(point: { x: number; y: number; z: number }): GeoCoordinates {
  const r = Math.sqrt(point.x ** 2 + point.y ** 2 + point.z ** 2);
  if (r === 0 || !Number.isFinite(r)) {
    return { lat: 0, lng: 0 };
  }
  const yNorm = Math.max(-1, Math.min(1, point.y / r));
  const lat = 90 - Math.acos(yNorm) * RAD_TO_DEG;
  // Da x = -sin(phi)cos(theta), z = sin(phi)sin(theta):
  //   theta = atan2(z, -x)  =>  lng = theta_in_deg - 180
  const lng = Math.atan2(point.z, -point.x) * RAD_TO_DEG - 180;
  return { lat, lng: normalizeLng(lng) };
}

/**
 * Distanza geodetica approssimata in km tra due punti, calcolata con
 * la formula di Haversine (distanza ortodromica su sfera di raggio 6371 km):
 *
 *   a = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2)
 *   c = 2 · atan2(√a, √(1−a))
 *   d = R · c
 *
 * L'approssimazione sferica introduce un errore < 0,5% rispetto
 * all'ellissoide WGS84: più che sufficiente per il gameplay.
 */
export function haversineDistanceKm(a: GeoCoordinates, b: GeoCoordinates): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const clamped = Math.min(1, Math.max(0, h));
  const c = 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
  return EARTH_RADIUS_KM * c;
}

/**
 * Punteggio deterministico di un round in base alla distanza in km
 * tra la risposta del giocatore e la destinazione.
 *
 * Formula (esponenziale decrescente, stile GeoGuessr):
 *
 *   score(d) = round( 5000 · e^(−d / 2000) )     per d > 25 km
 *   score(d) = 5000                                per d ≤ 25 km
 *
 * Limiti espliciti:
 *   - 0 ≤ score ≤ 5000 sempre;
 *   - distanza ≤ 25 km        -> 5000 punti (risposta "perfetta");
 *   - distanza ≈ 1.386 km     -> ~2500 punti (metà punteggio);
 *   - distanza ≥ 20.015 km (antipodi) -> tende a 0 (minimo ~0 punti);
 *   - nessuna risposta (timeout)     -> 0 punti (gestito dall'engine).
 *
 * La funzione è monotona non crescente in d e deterministica:
 * stessa distanza => stesso punteggio, indipendentemente dal tempo.
 */
export function calculateScore(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return 0;
  if (distanceKm <= PERFECT_TOLERANCE_KM) return MAX_ROUND_SCORE;
  const raw = MAX_ROUND_SCORE * Math.exp(-distanceKm / SCORE_DECAY_KM);
  return Math.max(0, Math.min(MAX_ROUND_SCORE, Math.round(raw)));
}

/**
 * Giudizio testuale associato a una distanza, usato nel feedback UI.
 * Soglie documentate e testate.
 */
export function distanceVerdict(distanceKm: number): string {
  if (distanceKm <= PERFECT_TOLERANCE_KM) return "Colpito in pieno! 🎯";
  if (distanceKm <= 100) return "Impressionante! 🔥";
  if (distanceKm <= 500) return "Ottima mira! 👏";
  if (distanceKm <= 1500) return "Buona intuizione! 👍";
  if (distanceKm <= 3000) return "Sei nella regione giusta 🧭";
  if (distanceKm <= 6000) return "Continente corretto, circa… 🌍";
  if (distanceKm <= 10000) return "Molto lontano 😬";
  return "Praticamente agli antipodi! 🌓";
}

/**
 * Formatta una distanza in km in modo leggibile (locale it-IT).
 * Esempi: 0.4 -> "400 m", 12.34 -> "12 km", 1105.6 -> "1.106 km".
 */
export function formatDistance(distanceKm: number): string {
  if (!Number.isFinite(distanceKm)) return "—";
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  // Raggruppamento migliaia manuale (stile it-IT): Intl.NumberFormat
  // non è deterministico tra ambienti con ICU ridotto (es. Node small-icu).
  const grouped = String(Math.round(distanceKm)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped} km`;
}

/**
 * Punto intermedio (midpoint) lungo l'arco di cerchio massimo tra
 * due coordinate: utile per centrare la camera nel reveal del risultato.
 */
export function greatCircleMidpoint(a: GeoCoordinates, b: GeoCoordinates): GeoCoordinates {
  const [ax, ay, az] = latLngToVector3(a.lat, a.lng, 1);
  const [bx, by, bz] = latLngToVector3(b.lat, b.lng, 1);
  const mx = ax + bx;
  const my = ay + by;
  const mz = az + bz;
  // Punti antipodali: il midpoint è indefinito; restituiamo `a`.
  if (Math.sqrt(mx ** 2 + my ** 2 + mz ** 2) < 1e-9) return a;
  return vector3ToLatLng({ x: mx, y: my, z: mz });
}

/**
 * Genera N punti 3D lungo l'arco di cerchio massimo tra due coordinate,
 * sollevati proporzionalmente alla distanza (effetto "arco di volo")
 * per disegnare la linea risposta→destinazione sul globo.
 */
export function greatCircleArcPoints(
  a: GeoCoordinates,
  b: GeoCoordinates,
  segments = 48,
  baseRadius = 1.005
): [number, number, number][] {
  const va = latLngToVector3(a.lat, a.lng, 1);
  const vb = latLngToVector3(b.lat, b.lng, 1);
  const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const angle = Math.acos(dot);
  if (angle < 1e-6) {
    return [latLngToVector3(a.lat, a.lng, baseRadius)];
  }
  const lift = 0.05 + angle * 0.06; // arco più alto per tratte lunghe
  const points: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Slerp tra i due vettori unitari
    const s0 = Math.sin((1 - t) * angle) / Math.sin(angle);
    const s1 = Math.sin(t * angle) / Math.sin(angle);
    const r = baseRadius + Math.sin(t * Math.PI) * lift;
    points.push([
      (va[0] * s0 + vb[0] * s1) * r,
      (va[1] * s0 + vb[1] * s1) * r,
      (va[2] * s0 + vb[2] * s1) * r,
    ]);
  }
  return points;
}
