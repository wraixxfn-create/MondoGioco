// ============================================================
// MondoGioco — Generazione degli indizi dai dati fattuali
// ============================================================
// I pacchetti generati (decine di migliaia di potenziali record) non
// memorizzano testi: gli indizi vengono costruiti a runtime dai campi
// fattuali già presenti nel record (popolazione, paese, posizione nel
// paese, distanza dalla capitale, coordinate).
//
// REGOLA: nessun indizio generato aggiunge informazioni che non siano
// già nel dataset. Non viene "inventato" nulla: le frasi derivano solo
// da popolazione, geometria del paese e coordinate.

import type { CountryReference } from "@/data/content/schema";
import { COUNTRY_REFERENCE } from "@/data/content/generated/country-reference";
import type { HydratedLocation } from "@/data/content/schema";
import { haversineDistanceKm } from "@/lib/game/geo";

const COUNTRIES_BY_ISO = new Map<string, CountryReference>(
  COUNTRY_REFERENCE.map((entry) => [entry.iso2, entry])
);

/** Riferimento di un paese (utile anche ai filtri dell'interfaccia). */
export function countryReference(iso2: string): CountryReference | undefined {
  return COUNTRIES_BY_ISO.get(iso2);
}

export function countryReferences(): CountryReference[] {
  return COUNTRY_REFERENCE;
}

/** Formattazione in italiano dei numeri grandi ("2,3 milioni", "232 mila"). */
export function formatPopulation(population: number): string {
  if (!Number.isFinite(population) || population <= 0) return "poche migliaia";
  if (population >= 1_000_000) {
    const millions = Math.round(population / 100_000) / 10;
    return `${millions.toString().replace(".", ",")} milioni`;
  }
  if (population >= 10_000) return `${Math.round(population / 1_000)} mila`;
  if (population >= 1_000) return `${(population / 1_000).toFixed(1).replace(".", ",")} mila`;
  return `${population}`;
}

const DIRECTION_LABEL: Record<string, string> = {
  north: "nord",
  south: "sud",
  east: "est",
  west: "ovest",
  center: "centro",
};

/**
 * Posizione del punto entro il bounding box del paese (derivata dalle
 * geometrie Natural Earth, pubblico dominio).
 */
export function positionInCountry(
  lat: number,
  lng: number,
  bbox: [number, number, number, number] | undefined
): string | null {
  if (!bbox) return null;
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const height = Math.max(1e-6, maxLat - minLat);
  const width = maxLng - minLng;
  const ny = (lat - minLat) / height;
  const nx = width > 0 && width < 180 ? (lng - minLng) / width : null;
  const vertical = ny > 0.66 ? "north" : ny < 0.33 ? "south" : "center";
  const horizontal = nx === null ? null : nx > 0.66 ? "east" : nx < 0.33 ? "west" : "center";
  if (vertical === "center" && (horizontal === null || horizontal === "center")) return "centro";
  const parts: string[] = [];
  if (vertical !== "center") parts.push(DIRECTION_LABEL[vertical]);
  if (horizontal && horizontal !== "center") parts.push(DIRECTION_LABEL[horizontal]);
  if (parts.length === 0) return "centro";
  return parts.join("-");
}

/** "circa 41,9° di latitudine nord e 12,5° di longitudine est" */
export function formatCoordinatesHint(lat: number, lng: number): string {
  const latText = `${Math.abs(lat).toFixed(1).replace(".", ",")}° di latitudine ${
    lat >= 0 ? "nord" : "sud"
  }`;
  const lngText = `${Math.abs(lng).toFixed(1).replace(".", ",")}° di longitudine ${
    lng >= 0 ? "est" : "ovest"
  }`;
  return `Le sue coordinate sono circa ${latText} e ${lngText}.`;
}

/** Distanza arrotondata in modo leggibile (es. "circa 120 km"). */
function formatDistanceKm(distanceKm: number): string {
  if (distanceKm < 10) return "poche decine di km";
  if (distanceKm < 100) return `circa ${Math.round(distanceKm / 10) * 10} km`;
  if (distanceKm < 1_000) return `circa ${Math.round(distanceKm / 50) * 50} km`;
  return `circa ${Math.round(distanceKm / 100) * 100} km`;
}

/**
 * Costruisce gli indizi per i luoghi che non li hanno scritti a mano.
 * Restituisce sempre almeno due frasi, dal vago allo specifico.
 */
export function buildHints(location: HydratedLocation): string[] {
  const hints: string[] = [];
  const reference = countryReference(location.countryCode.split(";")[0]);
  const isSettlement = Boolean(location.category === "city" || location.category === "capital");

  if (isSettlement) {
    const population = location.population ? formatPopulation(location.population) : null;
    const first = location.category === "capital" ? "Capitale" : "Città";
    hints.push(
      population
        ? `${first} di ${location.country}, con ${population} di abitanti.`
        : `${first} di ${location.country}.`
    );

    const parts: string[] = [];
    const position = reference?.bbox
      ? positionInCountry(location.coordinates.lat, location.coordinates.lng, reference.bbox)
      : null;
    parts.push(
      position && position !== "centro"
        ? `Si trova nel ${position} del paese`
        : "Si trova nella parte centrale del paese"
    );
    if (location.themes.includes("coastal")) parts.push("non lontano dalla costa");
    else parts.push("nell'entroterra");
    hints.push(`${parts.join(", ")}.`);

    if (reference?.capitalCoords && reference.capitalName && location.category !== "capital") {
      const distanceKm = haversineDistanceKm(location.coordinates, reference.capitalCoords);
      if (distanceKm >= 25) {
        hints.push(`Dista ${formatDistanceKm(distanceKm)} da ${reference.capitalName}.`);
      }
    }
    hints.push(formatCoordinatesHint(location.coordinates.lat, location.coordinates.lng));
    return hints;
  }

  // Categorie non-insediative (estensioni future del dataset).
  hints.push(`Si trova in ${location.country}.`);
  hints.push(formatCoordinatesHint(location.coordinates.lat, location.coordinates.lng));
  return hints;
}
