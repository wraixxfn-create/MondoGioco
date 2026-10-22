#!/usr/bin/env node
/**
 * Genera i pacchetti di contenuti geografici di MondoGioco.
 *
 * Il dataset NON è scritto a mano: è derivato da banche dati aperte, con
 * una catena di controlli automatici (verifica punto-entro-confini,
 * deduplicazione spaziale, completezza dei metadati). Ogni file generato
 * riporta in testa la provenienza e la licenza dei dati.
 *
 * FONTI (vedi `data/content/sources.ts`)
 * - `all-the-cities` (MIT) → export GeoNames cities1000 (CC BY 4.0):
 *   id, nome, coordinate, popolazione, feature code, codice amministrativo.
 * - `countries-list` (MIT) → continente per codice ISO 3166-1.
 * - `i18n-iso-countries` (MIT) → denominazioni in italiano/inglese, ISO numeric.
 * - `world-atlas` (ISC) → geometrie Natural Earth 1:10m (pubblico dominio),
 *   usate SOLO per: verifica punto-entro-confini, bounding box, posizione
 *   relativa nel paese, distanza dalla costa.
 *
 * USO
 *   node scripts/build-content.mjs           # rigenera i pacchetti
 *   node scripts/build-content.mjs --check   # verifica che siano allineati
 *
 * I pacchetti generati sono committati: l'app non ha bisogno di eseguire
 * questo script per funzionare.
 */
import { writeFileSync, readFileSync, mkdirSync, readdirSync, unlinkSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { COUNTRY_NAME_OVERRIDES, CITY_NAME_OVERRIDES } from "./data/italian-names.mjs";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "data", "content", "generated");

// ------------------------------------------------------------
// Parametri di selezione (documentati in docs/CONTENT.md)
// ------------------------------------------------------------
const CONFIG = {
  /** Popolazione minima: coincide col taglio del dataset GeoNames cities1000. */
  minPopulation: 1000,
  /** Soglia "grande città": include tutto ciò che supera questa popolazione. */
  bigCityPopulation: 150_000,
  /** Numero minimo di città per paese (per garantire copertura globale). */
  perCountryMin: 12,
  /** Tetto per paese: evita che Cina/India/USA dominino il dataset. */
  perCountryMax: 100,
  /** Distanza minima fra due luoghi (km): evita sobborghi duplicati. */
  dedupeKm: 12,
  /** Distanza dalla costa entro cui un luogo è considerato "costiero" (km). */
  coastalKm: 25,
  /** Tolleranza per i luoghi vicini a un confine o a una costa (km). */
  borderToleranceKm: 30,
  /** Tolleranza per isole non rappresentate alla scala 1:10m (km). */
  islandToleranceKm: 60,
  /**
   * Tolleranza per i punti che stanno in acqua (fiumi e laghi): il punto
   * può trovarsi a distanza dal confine dello Stato di riferimento.
   */
  waterToleranceKm: 150,
  /** Margine (gradi) sul bounding box per il controllo dei bacini interni. */
  waterBboxMarginDeg: 1.5,
  /**
   * Popolazione sopra la quale una città è "facile" da collocare.
   * Le soglie sono calibrate sulle percentuali del dataset selezionato
   * (≈ 23% facile / 41% medio / 36% difficile) e sono documentate.
   */
  easyPopulation: 500_000,
  /** Popolazione sopra la quale una città è di difficoltà media. */
  mediumPopulation: 150_000,
  /** Oltre questa soglia una città è una megalopoli (tema). */
  megacityPopulation: 5_000_000,
};

const CONTENT_VERSION = "1.0.0";
const PACK_VERSION = "1.0.0";

const CONTINENT_BY_CODE = {
  AF: "africa",
  AN: "antarctica",
  AS: "asia",
  EU: "europe",
  NA: "north_america",
  OC: "oceania",
  SA: "south_america",
};

const CONTINENT_LABEL = {
  africa: "Africa",
  asia: "Asia",
  europe: "Europa",
  north_america: "America del Nord",
  south_america: "America del Sud",
  oceania: "Oceania",
  antarctica: "Antartide",
};

// ------------------------------------------------------------
// Utilità geografiche
// ------------------------------------------------------------
const EARTH_RADIUS_KM = 6371.0088;
const toRad = (d) => (d * Math.PI) / 180;

function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function ringsOf(geometry) {
  const out = [];
  if (geometry.type === "Polygon") out.push(...geometry.coordinates);
  else if (geometry.type === "MultiPolygon")
    for (const poly of geometry.coordinates) out.push(...poly);
  return out;
}

/** Point-in-polygon (even-odd su tutti gli anelli: gestisce i buchi). */
function pointInRings(rings, lat, lng) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function bboxOf(rings) {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const ring of rings)
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  return [minLng, minLat, maxLng, maxLat];
}

/** Distanza approssimata (in km) da un insieme di anelli: minimo sui vertici. */
function distanceToRingsKm(rings, lat, lng) {
  let best = Infinity;
  for (const ring of rings) {
    for (const [rlng, rlat] of ring) {
      const d = haversineKm(lat, lng, rlat, rlng);
      if (d < best) best = d;
    }
  }
  return best;
}

/** Griglia 1° × 1° di vertici: rende O(1) la ricerca del vertice vicino. */
function buildVertexGrid(rings) {
  const grid = new Map();
  let count = 0;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      const key = `${Math.floor(lng)}:${Math.floor(lat)}`;
      let cell = grid.get(key);
      if (!cell) grid.set(key, (cell = []));
      cell.push(lng, lat);
      count++;
    }
  }
  return { grid, count };
}

/** Distanza minima (km) dai vertici della griglia, cercando solo le celle vicine. */
function distanceToGridKm({ grid }, lat, lng, capKm) {
  const latSpan = Math.ceil(capKm / 111) + 1;
  const lngSpan = Math.ceil(capKm / Math.max(1, 111 * Math.cos(toRad(lat)))) + 1;
  let best = Infinity;
  for (let dLat = -latSpan; dLat <= latSpan; dLat++) {
    for (let dLng = -lngSpan; dLng <= lngSpan; dLng++) {
      const cell = grid.get(`${Math.floor(lng) + dLng}:${Math.floor(lat) + dLat}`);
      if (!cell) continue;
      for (let i = 0; i < cell.length; i += 2) {
        const d = haversineKm(lat, lng, cell[i + 1], cell[i]);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

/**
 * Classifica un punto rispetto ai paesi dichiarati:
 * - "inside": cade dentro la geometria di uno dei paesi indicati;
 * - "near": è entro la tolleranza (coste, confini) o su un'isola non
 *   rappresentata alla scala 1:10m;
 * - "outside": cade dentro un paese NON dichiarato (errore di attribuzione);
 * - "unavailable": nessuna geometria disponibile per i paesi indicati.
 */
function classifyPoint(lat, lng, codes, category) {
  const round1 = (value) => Math.round(value * 10) / 10;
  let nearestDeclared = Infinity;
  for (const code of codes) {
    const geometry = geometryByIso2.get(code);
    if (!geometry) continue;
    if (pointInRings(geometry.rings, lat, lng)) return { geoCheck: "inside" };
    nearestDeclared = Math.min(nearestDeclared, distanceToRingsKm(geometry.rings, lat, lng));
  }
  if (nearestDeclared === Infinity) return { geoCheck: "unavailable" };
  const tolerance =
    category === "river" || category === "lake"
      ? CONFIG.waterToleranceKm
      : CONFIG.borderToleranceKm;
  if (nearestDeclared <= tolerance) {
    return { geoCheck: "near", borderDistanceKm: round1(nearestDeclared) };
  }
  // Fuori dai paesi dichiarati: è dentro un altro Stato?
  for (const [code, geometry] of geometryByIso2) {
    if (codes.includes(code)) continue;
    const [minLng, minLat, maxLng, maxLat] = geometry.bbox;
    if (lng < minLng - 1 || lng > maxLng + 1 || lat < minLat - 1 || lat > maxLat + 1) continue;
    if (pointInRings(geometry.rings, lat, lng)) {
      return {
        geoCheck: "outside",
        borderDistanceKm: round1(nearestDeclared),
        insideCountry: code,
      };
    }
  }
  // In mare aperto: isola o tratto di costa assente alla scala 1:10m.
  if (nearestDeclared <= CONFIG.islandToleranceKm) {
    return { geoCheck: "near", borderDistanceKm: round1(nearestDeclared) };
  }
  // Bacino interno (fiumi e laghi): il punto può essere lontano dal
  // confine ma deve cadere nel bounding box degli Stati dichiarati.
  if (category === "river" || category === "lake") {
    const margin = CONFIG.waterBboxMarginDeg;
    for (const code of codes) {
      const geometry = geometryByIso2.get(code);
      if (!geometry) continue;
      const [minLng, minLat, maxLng, maxLat] = geometry.bbox;
      if (
        lng >= minLng - margin &&
        lng <= maxLng + margin &&
        lat >= minLat - margin &&
        lat <= maxLat + margin
      ) {
        return { geoCheck: "near", borderDistanceKm: round1(nearestDeclared) };
      }
    }
  }
  return { geoCheck: "outside", borderDistanceKm: round1(nearestDeclared) };
}

// ------------------------------------------------------------
// Caricamento delle fonti
// ------------------------------------------------------------
console.log("• Caricamento dataset di origine…");
const CITIES = require("all-the-cities");
const { countries: ISO_COUNTRIES } = require("countries-list");
const isoCountries = require("i18n-iso-countries");
const topojson = require("topojson-client");

const worldTopo = require("world-atlas/countries-10m.json");
const landTopo = require("world-atlas/land-10m.json");

const countryFeatures = topojson.feature(worldTopo, worldTopo.objects.countries).features;
const landFeature = topojson.feature(landTopo, landTopo.objects.land).features[0];

/**
 * Natural Earth usa denominazioni abbreviate e, in alcuni casi, codici
 * ISO numeric duplicati (es. "Australia" e "Ashmore and Cartier Is.").
 * Il join con i codici ISO 3166-1 avviene quindi per NOME, con questa
 * tavola di alias per le 58 voci non identiche.
 */
const NATURAL_EARTH_ALIASES = {
  "S. Sudan": "SS",
  "W. Sahara": "EH",
  Congo: "CG",
  "Dem. Rep. Congo": "CD",
  "St-Martin": "MF",
  Macedonia: "MK",
  Turkey: "TR",
  "Central African Rep.": "CF",
  "Côte d'Ivoire": "CI",
  "Dominican Rep.": "DO",
  "Timor-Leste": "TL",
  eSwatini: "SZ",
  "Bosnia and Herz.": "BA",
  "United States of America": "US",
  "Eq. Guinea": "GQ",
  Vatican: "VA",
  Curaçao: "CW",
  "Turks and Caicos Is.": "TC",
  "St. Pierre and Miquelon": "PM",
  "Pitcairn Is.": "PN",
  "Fr. Polynesia": "PF",
  "Fr. S. Antarctic Lands": "TF",
  "Marshall Is.": "MH",
  "St. Vin. and Gren.": "VC",
  "U.S. Minor Outlying Is.": "UM",
  "Antigua and Barb.": "AG",
  "St. Kitts and Nevis": "KN",
  "U.S. Virgin Is.": "VI",
  "St-Barthélemy": "BL",
  "British Virgin Is.": "VG",
  "Cayman Is.": "KY",
  "Heard I. and McDonald Is.": "HM",
  "São Tomé and Principe": "ST",
  Åland: "AX",
  "Faeroe Is.": "FO",
  "Br. Indian Ocean Ter.": "IO",
  "Cook Is.": "CK",
  "Wallis and Futuna Is.": "WF",
  "Solomon Is.": "SB",
  "S. Geo. and the Is.": "GS",
  "Falkland Is.": "FK",
  "N. Mariana Is.": "MP",
  "Solomon Is": "SB",
  "N. Cyprus": "CY",
};

/** geometrie per ISO alpha-2 (join per nome inglese + alias) */
const geometryByIso2 = new Map();
const nameToIso2 = new Map();
for (const [iso2, meta] of Object.entries(ISO_COUNTRIES)) {
  if (!nameToIso2.has(meta.name)) nameToIso2.set(meta.name, iso2);
}

for (const feature of countryFeatures) {
  const englishName = feature.properties?.name;
  if (!englishName) continue;
  const iso2 = NATURAL_EARTH_ALIASES[englishName] ?? nameToIso2.get(englishName);
  if (!iso2 || geometryByIso2.has(iso2)) continue;
  const rings = ringsOf(feature.geometry);
  geometryByIso2.set(iso2, { name: englishName, rings, bbox: bboxOf(rings) });
}

console.log(
  `  · ${CITIES.length.toLocaleString("it-IT")} città (GeoNames) · ${countryFeatures.length} geometrie Natural Earth · ${geometryByIso2.size} paesi con geometria`
);

console.log("• Costruzione indice della linea di costa…");
const landRings = ringsOf(landFeature.geometry);
const coastGrid = buildVertexGrid(landRings);
console.log(`  · ${coastGrid.count.toLocaleString("it-IT")} vertici di costa indicizzati`);

// ------------------------------------------------------------
// Metadati dei paesi
// ------------------------------------------------------------
function countryName(iso2) {
  if (COUNTRY_NAME_OVERRIDES[iso2]) return COUNTRY_NAME_OVERRIDES[iso2];
  const automatic = isoCountries.getName(iso2, "it");
  if (!automatic) return ISO_COUNTRIES[iso2]?.name ?? iso2;
  // Alcune traduzioni automatiche sono doppie ("Birmania  Myanmar"): si tiene la prima.
  return automatic.split(/\s{2,}/)[0].trim();
}

const countryMeta = new Map();
for (const iso2 of Object.keys(ISO_COUNTRIES)) {
  const meta = ISO_COUNTRIES[iso2];
  const continent = CONTINENT_BY_CODE[meta.continent];
  if (!continent) continue;
  // L'Antartide non ha insediamenti permanenti: l'unica voce GeoNames sopra
  // la soglia di popolazione è McMurdo Station, una base di ricerca con
  // popolazione stagionale. Non è un "luogo abitato": si esclude il
  // continente dal generatore città (restano i record curati a mano).
  if (continent === "antarctica") continue;
  countryMeta.set(iso2, {
    iso2,
    iso3: isoCountries.alpha2ToAlpha3(iso2) ?? "",
    numeric: isoCountries.alpha2ToNumeric(iso2) ?? "",
    nameIt: countryName(iso2),
    nameEn: meta.name,
    continent,
    geometry: geometryByIso2.get(iso2),
    bbox: geometryByIso2.get(iso2)?.bbox,
    capitalName: "",
    capitalCoords: undefined,
  });
}

// ------------------------------------------------------------
// Pacchetti curati: indici per evitare duplicati fra dataset
// ------------------------------------------------------------
// Un luogo già descritto a mano (es. "Roma") non deve comparire anche
// fra le città generate: avremmo due record per lo stesso posto, con il
// rischio di proporlo due volte al giocatore. I pacchetti curati
// vincono sempre (hanno indizi migliori e revisione umana).
const curatedPacks = [];
for (const file of readdirSync(join(root, "data", "content", "packs"))
  .filter((name) => name.endsWith(".ts"))
  .sort()) {
  const source = readFileSync(join(root, "data", "content", "packs", file), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const tmpFile = join(root, "data", "content", `.pack.${file.replace(/\.ts$/, "")}.mjs`);
  writeFileSync(tmpFile, transpiled);
  const pack = (await import(pathToFileURL(tmpFile).href)).PACK;
  unlinkSync(tmpFile);
  curatedPacks.push(pack);
}

/** chiavi "ISO2:nome" dei luoghi già curati */
const curatedPlaceKeys = new Set();
for (const pack of curatedPacks) {
  for (const row of pack.rows) {
    const [, name, , countryCode] = row;
    for (const code of countryCode.split(";")) {
      curatedPlaceKeys.add(`${code}:${name.trim().toLowerCase()}`);
    }
  }
}
console.log(
  `  · ${curatedPacks.length} pacchetti curati · ${curatedPlaceKeys.size} luoghi da non duplicare`
);

/** coordinate dei centri abitati curati: vincolano la deduplica spaziale */
const curatedSettlementPoints = [];
for (const pack of curatedPacks) {
  for (const row of pack.rows) {
    const [, , , , , category, , lat, lng] = row;
    if (category === "city" || category === "capital") curatedSettlementPoints.push([lat, lng]);
  }
}

// ------------------------------------------------------------
// Selezione delle capitali (feature code PPLC di GeoNames)
// ------------------------------------------------------------
for (const city of CITIES) {
  if (city.featureCode !== "PPLC") continue;
  const meta = countryMeta.get(city.country);
  if (!meta) continue;
  if (!meta.capitalCoords || city.population > (meta.capitalPopulation ?? 0)) {
    meta.capitalPopulation = city.population;
    meta.capitalCoords = { lat: city.loc.coordinates[1], lng: city.loc.coordinates[0] };
    meta.capitalName = CITY_NAME_OVERRIDES[`${city.country}:${city.name}`] ?? city.name;
  }
}

// ------------------------------------------------------------
// Selezione e arricchimento delle città
// ------------------------------------------------------------
console.log("• Selezione e controllo qualità…");

const byCountry = new Map();
for (const city of CITIES) {
  if (!city.loc || !Array.isArray(city.loc.coordinates)) continue;
  if (city.population < CONFIG.minPopulation) continue;
  if (!countryMeta.has(city.country)) continue;
  let list = byCountry.get(city.country);
  if (!list) byCountry.set(city.country, (list = []));
  list.push(city);
}
for (const list of byCountry.values()) list.sort((a, b) => b.population - a.population);

const selected = [];
const stats = {
  scanned: CITIES.length,
  eligible: 0,
  selected: 0,
  droppedDedupe: 0,
  droppedOutside: 0,
  droppedNoCountry: 0,
  droppedDuplicateName: 0,
  droppedCuratedDuplicate: 0,
  nearBorder: 0,
  offshore: 0,
  geoChecked: 0,
  coastal: 0,
};

const seenNames = new Set();
const acceptedCoords = []; // per la deduplicazione spaziale O(n²) su blocchi
const dedupeCellSize = 1; // gradi
const dedupeGrid = new Map();
const dedupeKey = (lat, lng) =>
  `${Math.floor(lat / dedupeCellSize)}:${Math.floor(lng / dedupeCellSize)}`;

function tooClose(lat, lng) {
  const baseLat = Math.floor(lat / dedupeCellSize);
  const baseLng = Math.floor(lng / dedupeCellSize);
  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLng = -1; dLng <= 1; dLng++) {
      const cell = dedupeGrid.get(`${baseLat + dLat}:${baseLng + dLng}`);
      if (!cell) continue;
      for (const point of cell) {
        if (haversineKm(lat, lng, point[0], point[1]) < CONFIG.dedupeKm) return true;
      }
    }
  }
  return false;
}

const warnings = [];

// I centri abitati già curati occupano la griglia di deduplica: una città
// generata a meno di `dedupeKm` da essi viene scartata (vince il curato).
for (const [lat, lng] of curatedSettlementPoints) {
  const key = dedupeKey(lat, lng);
  let cell = dedupeGrid.get(key);
  if (!cell) dedupeGrid.set(key, (cell = []));
  cell.push([lat, lng]);
}

for (const [iso2, list] of byCountry) {
  const meta = countryMeta.get(iso2);
  let taken = 0;
  // Le capitali si processano PRIMA delle altre città: così, in caso di
  // conflitto spaziale (es. Nuova Delhi/Delhi), vince la capitale.
  const ordered = [
    ...list.filter((city) => city.featureCode === "PPLC"),
    ...list.filter((city) => city.featureCode !== "PPLC"),
  ];
  for (const city of ordered) {
    stats.eligible++;
    const isCapital = city.featureCode === "PPLC";
    const isBig = city.population >= CONFIG.bigCityPopulation;
    if (!isCapital && !isBig && taken >= CONFIG.perCountryMin) continue;
    if (!isCapital && taken >= CONFIG.perCountryMax) continue;

    const lat = city.loc.coordinates[1];
    const lng = city.loc.coordinates[0];

    // (1) Deduplicazione spaziale: niente sobborghi quasi coincidenti.
    if (!isCapital && tooClose(lat, lng)) {
      stats.droppedDedupe++;
      continue;
    }

    // (2) Controllo punto-entro-confini sulla geometria Natural Earth.
    const audit = classifyPoint(lat, lng, [iso2]);
    const geoCheck = audit.geoCheck;
    const borderDistanceKm = audit.borderDistanceKm;
    if (geoCheck !== "unavailable") stats.geoChecked++;
    if (geoCheck === "outside") {
      stats.droppedOutside++;
      warnings.push(
        `SCARTATO ${city.name} (${iso2}) — coordinate fuori dai confini (${borderDistanceKm} km${
          audit.insideCountry ? `, dentro ${audit.insideCountry}` : ""
        })`
      );
      continue;
    }
    if (geoCheck === "near") stats.nearBorder++;

    // (3) Posizione relativa nel paese (derivata dal bounding box).
    const bbox = meta.bbox;
    let position = "";
    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox;
      const height = Math.max(1e-6, maxLat - minLat);
      const width = maxLng - minLng;
      const ny = (lat - minLat) / height;
      const nx = width > 0 && width < 180 ? (lng - minLng) / width : null;
      const vertical = ny > 0.66 ? "north" : ny < 0.33 ? "south" : "center";
      const horizontal = nx === null ? null : nx > 0.66 ? "east" : nx < 0.33 ? "west" : "center";
      position =
        vertical === "center" && (horizontal === null || horizontal === "center")
          ? "center"
          : `${vertical}${horizontal && horizontal !== "center" ? `-${horizontal}` : ""}`;
    }

    // (4) Distanza dalla costa (tema "costiero").
    const coastDistanceKm = distanceToGridKm(coastGrid, lat, lng, CONFIG.coastalKm);
    const coastal = coastDistanceKm <= CONFIG.coastalKm;
    if (coastal) stats.coastal++;

    // (5) Difficoltà: proxy oggettivo = popolazione (documentato).
    let difficulty = 3;
    if (city.population >= CONFIG.easyPopulation) difficulty = 1;
    else if (city.population >= CONFIG.mediumPopulation) difficulty = 2;
    if (isCapital) difficulty = Math.max(1, difficulty - 1);

    // (6) Flag/temi.
    let flags = 0;
    if (coastal) flags |= 1;
    if (city.population >= CONFIG.megacityPopulation) flags |= 2;
    if (city.population >= CONFIG.easyPopulation) flags |= 4;
    if (city.featureCode === "PPLA" || city.featureCode === "PPLA2") flags |= 8;
    if (isCapital) flags |= 16;

    const name = CITY_NAME_OVERRIDES[`${iso2}:${city.name}`] ?? city.name;

    // (6bis) Il luogo è già descritto da un pacchetto curato? Allora si
    //        tiene la versione curata e si scarta la riga generata.
    if (curatedPlaceKeys.has(`${iso2}:${name.toLowerCase()}`)) {
      stats.droppedCuratedDuplicate++;
      continue;
    }

    // (7) Nomi univoci: due luoghi con lo stesso nome nello stesso paese
    //     renderebbero il round ambiguo (il giocatore legge il nome).
    const nameKey = `${iso2}:${name.toLowerCase()}`;
    if (seenNames.has(nameKey)) {
      stats.droppedDuplicateName++;
      continue;
    }
    seenNames.add(nameKey);

    selected.push({
      id: `gn-${city.cityId}`,
      name,
      countryCode: iso2,
      admin1: city.adminCode ?? "",
      category: isCapital ? "capital" : "city",
      difficulty,
      lat: Math.round(lat * 1e4) / 1e4,
      lng: Math.round(lng * 1e4) / 1e4,
      population: city.population,
      flags,
      geoCheck,
      borderDistanceKm,
      position,
      coastal,
    });

    const key = dedupeKey(lat, lng);
    let cell = dedupeGrid.get(key);
    if (!cell) dedupeGrid.set(key, (cell = []));
    cell.push([lat, lng]);
    acceptedCoords.push([lat, lng]);
    taken++;
  }
}

stats.selected = selected.length;

// ------------------------------------------------------------
// Emissione dei pacchetti
// ------------------------------------------------------------
const generatedAt = new Date().toISOString().slice(0, 10);
const geoCheckCode = { inside: 0, near: 1, outside: 2, unavailable: 3 };

const header = (title) => `// ============================================================
// ${title}
// ============================================================
// FILE GENERATO da \`npm run content:build\` — NON MODIFICARE A MANO.
// Le correzioni si fanno nelle fonti o nello script di generazione.
//
// Fonte dati: GeoNames cities1000 (CC BY 4.0) via pacchetto npm
//   \`all-the-cities\` (MIT) — © GeoNames contributors.
// Geometrie di controllo: Natural Earth 1:10m (pubblico dominio) via
//   pacchetto npm \`world-atlas\` (ISC).
// Denominazioni: \`i18n-iso-countries\` (MIT) e \`countries-list\` (MIT).
// Generato il ${generatedAt} · versione contenuti ${CONTENT_VERSION}.
// ============================================================
`;

function rowToLiteral(row) {
  return `["${row.id}","${row.name.replace(/"/g, '\\"')}","${row.countryCode}","${row.admin1}","${row.category}",${row.difficulty},${row.lat},${row.lng},${row.population},${row.flags},${geoCheckCode[row.geoCheck]}]`;
}

/** Metadati pubblici di un pacchetto (senza campi interni). */
function publicPack(pack) {
  return {
    id: pack.id,
    version: pack.version,
    title: pack.title,
    count: pack.count,
    approxBytes: pack.approxBytes,
    sourceIds: pack.sourceIds,
    curated: pack.curated,
  };
}

function writePack(continent, rows) {
  const packId = `cities-${continent}`;
  const categories = [...new Set(rows.map((r) => r.category))].sort();
  const body = `import type { GeneratedPack } from "../schema";

export const PACK: GeneratedPack = {
  id: ${JSON.stringify(packId)},
  version: ${JSON.stringify(PACK_VERSION)},
  title: ${JSON.stringify(`Città e capitali — ${CONTINENT_LABEL[continent]}`)},
  description: ${JSON.stringify(
    `Città e capitali dell'${CONTINENT_LABEL[continent] === "Europa" ? "" : ""}${
      CONTINENT_LABEL[continent]
    } selezionate da GeoNames con controllo punto-entro-confini su Natural Earth.`
  )},
  continents: [${JSON.stringify(continent)}],
  sourceId: "geonames",
  categories: ${JSON.stringify(categories)},
  rows: [
${rows.map(rowToLiteral).join(",\n")}
  ],
};

export default PACK;
`;
  const file = join(outDir, `${packId}.ts`);
  writeFileSync(file, header(`${packId}.ts — ${rows.length} luoghi`) + body, "utf8");
  return { file, bytes: statSync(file).size, categories };
}

mkdirSync(outDir, { recursive: true });

// ------------------------------------------------------------
// Audit geometrico dei pacchetti curati
// ------------------------------------------------------------
// I record scritti a mano vengono verificati con lo stesso controllo
// usato per le città: punto entro i confini del paese dichiarato.
// L'esito finisce in `curated-audit.ts`, usato a runtime per popolare
// `quality.geoCheck` e dai test per bloccare eventuali errori.
console.log("• Verifica geometrica dei pacchetti curati…");
const curatedAudit = {};
let audited = 0;
let auditedOutside = 0;
let auditedNear = 0;
let auditedUnavailable = 0;
for (const pack of curatedPacks) {
  for (const row of pack.rows) {
    const [id, , , countryCode, , category, , lat, lng] = row;
    const audit = classifyPoint(lat, lng, countryCode.split(";"), category);
    curatedAudit[id] =
      audit.geoCheck === "inside"
        ? { geoCheck: "inside" }
        : {
            geoCheck: audit.geoCheck,
            ...(audit.borderDistanceKm !== undefined
              ? { borderDistanceKm: audit.borderDistanceKm }
              : {}),
          };
    audited++;
    if (audit.geoCheck === "outside") {
      auditedOutside++;
      warnings.push(
        `CURATO FUORI CONFINE ${id} (${countryCode}) — ${audit.borderDistanceKm} km${
          audit.insideCountry ? `, dentro ${audit.insideCountry}` : ""
        }`
      );
    }
    if (audit.geoCheck === "near") auditedNear++;
    if (audit.geoCheck === "unavailable") auditedUnavailable++;
  }
}
console.log(
  `  · ${audited} record curati verificati · ${audited - auditedOutside - auditedNear - auditedUnavailable} dentro i confini · ${auditedNear} entro la tolleranza · ${auditedUnavailable} senza geometria · ${auditedOutside} da correggere`
);

writeFileSync(
  join(outDir, "curated-audit.ts"),
  header("curated-audit.ts — esito del controllo punto-entro-confini") +
    `import type { GeoCheckResult } from "../schema";

export interface CuratedGeoAuditEntry {
  geoCheck: GeoCheckResult;
  borderDistanceKm?: number;
}

export const CURATED_GEO_AUDIT: Record<string, CuratedGeoAuditEntry> = ${JSON.stringify(
      curatedAudit,
      null,
      2
    )};

export default CURATED_GEO_AUDIT;
`,
  "utf8"
);

const packs = [];
const byContinent = new Map();
for (const row of selected) {
  const continent = countryMeta.get(row.countryCode).continent;
  let list = byContinent.get(continent);
  if (!list) byContinent.set(continent, (list = []));
  list.push(row);
}

for (const continent of ["europe", "asia", "africa", "north_america", "south_america", "oceania"]) {
  const rows = (byContinent.get(continent) ?? []).sort((a, b) => a.id.localeCompare(b.id));
  if (rows.length === 0) continue;
  const { file, bytes, categories } = writePack(continent, rows);
  packs.push({
    id: `cities-${continent}`,
    version: PACK_VERSION,
    title: `Città e capitali — ${CONTINENT_LABEL[continent]}`,
    count: rows.length,
    approxBytes: bytes,
    sourceIds: ["geonames", "natural-earth", "iso-3166"],
    curated: false,
    categories,
  });
  console.log(
    `  · ${file.replace(root + "/", "")} — ${rows.length} luoghi (${(bytes / 1024).toFixed(0)} kB)`
  );
}

// Tabella di riferimento dei paesi (usa bbox e capitali reali).
const referenceRows = [...countryMeta.values()]
  .filter((meta) => meta.nameIt)
  .sort((a, b) => a.nameIt.localeCompare(b.nameIt, "it"));

const referenceBody = `import type { CountryReference } from "../schema";

export const COUNTRY_REFERENCE: CountryReference[] = ${JSON.stringify(
  referenceRows.map((meta) => ({
    iso2: meta.iso2,
    iso3: meta.iso3,
    numeric: meta.numeric,
    nameIt: meta.nameIt,
    nameEn: meta.nameEn,
    continent: meta.continent,
    capitalName: meta.capitalName,
    ...(meta.capitalCoords
      ? {
          capitalCoords: {
            lat: Math.round(meta.capitalCoords.lat * 1e4) / 1e4,
            lng: Math.round(meta.capitalCoords.lng * 1e4) / 1e4,
          },
        }
      : {}),
    ...(meta.bbox ? { bbox: meta.bbox.map((v) => Math.round(v * 1e4) / 1e4) } : {}),
  })),
  null,
  0
)};

export default COUNTRY_REFERENCE;
`;
writeFileSync(
  join(outDir, "country-reference.ts"),
  header("country-reference.ts — tavola di riferimento dei paesi") + referenceBody,
  "utf8"
);

// Statistiche del dataset (usate da test, documentazione e interfaccia).
const statsOut = {
  generatedAt,
  contentVersion: CONTENT_VERSION,
  schemaVersion: 2,
  config: CONFIG,
  totals: {
    cities: selected.length,
    countries: new Set(selected.map((r) => r.countryCode)).size,
    capitals: selected.filter((r) => r.category === "capital").length,
  },
  byContinent: {},
  byDifficulty: { 1: 0, 2: 0, 3: 0 },
  byTheme: {},
  quality: {
    geoChecked: stats.geoChecked,
    inside: selected.filter((r) => r.geoCheck === "inside").length,
    near: selected.filter((r) => r.geoCheck === "near").length,
    droppedOutside: stats.droppedOutside,
    droppedDedupe: stats.droppedDedupe,
    droppedDuplicateName: stats.droppedDuplicateName,
    droppedCuratedDuplicate: stats.droppedCuratedDuplicate,
    noGeometryCountries: [
      ...new Set(selected.filter((r) => r.geoCheck === "unavailable").map((r) => r.countryCode)),
    ].sort(),
    coastal: stats.coastal,
  },
  packs: packs.map(publicPack),
};

for (const row of selected) {
  const continent = countryMeta.get(row.countryCode).continent;
  statsOut.byContinent[continent] = (statsOut.byContinent[continent] ?? 0) + 1;
  statsOut.byDifficulty[row.difficulty] = (statsOut.byDifficulty[row.difficulty] ?? 0) + 1;
  const themes = ["city"];
  if (row.flags & 16) themes.push("capitals");
  if (row.flags & 4) themes.push("metropolis");
  if (row.flags & 2) themes.push("megacity");
  if (row.flags & 1) themes.push("coastal");
  if (row.flags & 8) themes.push("admin-capital");
  for (const theme of themes) statsOut.byTheme[theme] = (statsOut.byTheme[theme] ?? 0) + 1;
}

writeFileSync(join(outDir, "stats.json"), JSON.stringify(statsOut, null, 2) + "\n", "utf8");

const manifestBody = `import type { ContentManifest } from "../schema";

export const GENERATED_MANIFEST: ContentManifest = {
  schemaVersion: 2,
  contentVersion: ${JSON.stringify(CONTENT_VERSION)},
  generatedAt: ${JSON.stringify(generatedAt)},
  totalLocations: ${selected.length},
  packs: ${JSON.stringify(packs.map(publicPack), null, 2).split("\n").join("\n  ")},
};

export default GENERATED_MANIFEST;
`;
writeFileSync(
  join(outDir, "manifest.ts"),
  header("manifest.ts — inventario dei pacchetti generati") + manifestBody,
  "utf8"
);

// Formattazione con Prettier (coerente col resto del repository).
try {
  execFileSync(
    join(root, "node_modules", ".bin", "prettier"),
    ["--write", join("data", "content", "generated")],
    { cwd: root, stdio: "pipe" }
  );
} catch {
  console.warn("! Prettier non disponibile: i file generati non sono stati formattati.");
}

// ------------------------------------------------------------
// Report
// ------------------------------------------------------------
console.log("\n✓ Generazione completata");
console.log(`  · città selezionate: ${stats.selected}`);
console.log(`  · capitali: ${statsOut.totals.capitals} · paesi: ${statsOut.totals.countries}`);
console.log(`  · scartate (doppioni < ${CONFIG.dedupeKm} km): ${stats.droppedDedupe}`);
console.log(`  · scartate (coordinate incoerenti): ${stats.droppedOutside}`);
console.log(`  · scartate (nomi duplicati nello stesso paese): ${stats.droppedDuplicateName}`);
console.log(`  · scartate (già presenti nei pacchetti curati): ${stats.droppedCuratedDuplicate}`);
console.log(`  · vicine a confini/coste (tollerate): ${stats.nearBorder}`);
for (const warning of warnings.slice(0, 20)) console.warn(`  ! ${warning}`);
if (warnings.length > 20) console.warn(`  ! …e altri ${warnings.length - 20} avvisi`);

if (process.argv.includes("--check")) {
  console.log("\n--check: confronto con i file committati non ancora implementato in-script.");
  console.log("         Usa: git diff --exit-code -- data/content/generated");
}
