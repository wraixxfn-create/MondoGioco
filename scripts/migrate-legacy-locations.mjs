#!/usr/bin/env node
/**
 * MIGRAZIONE UNA TANTUM — converte `data/locations.ts` (dataset storico di
 * 133 luoghi) nel formato dei pacchetti curati `data/content/packs/curated-core.ts`.
 *
 * Eseguito una sola volta: lo script non fa parte della catena di build
 * (`npm run content:build`). Conserva gli id originali, perché gli id sono
 * stabili per definizione e sono referenziati dai test.
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = resolve(root, "data/.locations.migrated.mjs");

const source = readFileSync(resolve(root, "data/locations.ts"), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
writeFileSync(tmp, transpiled);
const { LOCATIONS } = await import(`file://${tmp}`);
unlinkSync(tmp);

/** Denominazione → codice ISO 3166-1 alpha-2 (anche multi-paese). */
const ISO_BY_NAME = {
  "Arabia Saudita": "SA",
  Argentina: "AR",
  "Argentina/Brasile": "AR;BR",
  Australia: "AU",
  Austria: "AT",
  Belgio: "BE",
  Bolivia: "BO",
  Brasile: "BR",
  Cambogia: "KH",
  Canada: "CA",
  "Canada/Stati Uniti": "CA;US",
  Cechia: "CZ",
  Cile: "CL",
  Cina: "CN",
  Colombia: "CO",
  "Corea del Sud": "KR",
  Cuba: "CU",
  Danimarca: "DK",
  Ecuador: "EC",
  Egitto: "EG",
  "Emirati Arabi Uniti": "AE",
  Etiopia: "ET",
  Fiji: "FJ",
  Finlandia: "FI",
  Francia: "FR",
  "Francia/Italia": "FR;IT",
  Germania: "DE",
  Ghana: "GH",
  Giappone: "JP",
  Giordano: "JO",
  Grecia: "GR",
  India: "IN",
  Indonesia: "ID",
  Iran: "IR",
  Iraq: "IQ",
  Irlanda: "IE",
  Islanda: "IS",
  "Israele/Palestina": "IL;PS",
  Italia: "IT",
  Kenya: "KE",
  Libia: "LY",
  Madagascar: "MG",
  Malaysia: "MY",
  Malta: "MT",
  Marocco: "MA",
  Messico: "MX",
  Mongolia: "MN",
  Nepal: "NP",
  "Nepal/Cina": "NP;CN",
  Nigeria: "NG",
  Norvegia: "NO",
  "Nuova Zelanda": "NZ",
  "Paesi Bassi": "NL",
  Panama: "PA",
  "Papua Nuova Guinea": "PG",
  Perù: "PE",
  "Polinesia Francese": "PF",
  Polonia: "PL",
  Portogallo: "PT",
  "RD del Congo": "CD",
  "Regno Unito": "GB",
  Russia: "RU",
  Singapore: "SG",
  Slovenia: "SI",
  Spagna: "ES",
  "Stati Uniti": "US",
  Sudafrica: "ZA",
  Svezia: "SE",
  Svizzera: "CH",
  Taiwan: "TW",
  Tanzania: "TZ",
  Thailandia: "TH",
  Tunisi: "TN",
  Turchia: "TR",
  Ucraina: "UA",
  Ungheria: "HU",
  Venezuela: "VE",
  Vietnam: "VN",
  "Zambia/Zimbabwe": "ZM;ZW",
};

/** Temi dedotti dal testo degli indizi (euristica trasparente e verificabile). */
const THEME_RULES = [
  [/\b(deserto|deserti|arid|dune|sahara|kalahari|gobi|atacama)\b/i, "desert"],
  [/\b(ghiaccia|polo|artico|antartid|calotta|-pack)\b/i, "polar"],
  [/\b(vulcan|cratere|lava|eruzion)\b/i, "volcano"],
  [/\b(isola|isole|arcipelago|atollo)\b/i, "island"],
  [/\b(fiume|foce|sorgente|cors|d'acqua|affluente| delta)\b/i, "water"],
  [/\b(lago|laghi|laguna|bacino)\b/i, "water"],
  [/\b(cascata|salto|rapide)\b/i, "water"],
  [/\b(montagn|cima|vetta|massiccio|catena|alpi|himalaya|ande|rilievo|picco)\b/i, "highland"],
  [
    /\b(antico|rovine|rovina|archeolog|impero|secolo a\.c|tomba|necropoli|acropoli|foro)\b/i,
    "ancient",
  ],
  [
    /\b(basilica|cattedrale|chiesa|moschea|tempio|santuario|monastero|abbazia|sinagoga)\b/i,
    "religious",
  ],
  [/\b(foresta|giungla|selva|parco nazionale|riserva|baia|fiordo|grotta|canyon|gola)\b/i, "nature"],
];

function themesFor(location) {
  const themes = new Set();
  if (location.category === "capital") themes.add("capitals");
  if (location.category === "monument") themes.add("wonder");
  if (location.category === "island") themes.add("island");
  const text = `${location.name} ${location.country} ${location.hints.join(" ")}`;
  for (const [pattern, theme] of THEME_RULES) {
    if (pattern.test(text)) themes.add(theme);
  }
  if (location.country.includes("/")) themes.add("border");
  return [...themes].filter((theme) => theme !== "nature");
}

const rows = LOCATIONS.map((location) => {
  const iso = ISO_BY_NAME[location.country];
  if (!iso) throw new Error(`Codice ISO mancante per "${location.country}" (${location.id})`);
  return [
    location.id,
    location.name,
    location.country === "Tunisi" ? "Tunisia" : location.country,
    iso,
    location.continent,
    location.category,
    location.difficulty,
    location.coordinates.lat,
    location.coordinates.lng,
    themesFor(location),
    location.hints,
  ];
});

const header = `// ============================================================
// Pacchetto curato: luoghi storici del dataset MondoGioco
// ============================================================
// Indizi scritti a mano dalla redazione (CC BY 4.0). Coordinate: punti di
// riferimento noti, NON inventati, arrotondati a 4 decimali.
// Le correzioni si fanno qui: il pacchetto ha una propria versione.
//
// Migrato dallo storico \`data/locations.ts\` (133 luoghi) con
// \`scripts/migrate-legacy-locations.mjs\`.
//
// ATTENZIONE: gli id sono stabili per definizione e sono referenziati dai
// test: non rinominare e non riutilizzare un id eliminato.
// ============================================================

import type { CuratedPack, CuratedRow } from "../schema";

const ROWS: CuratedRow[] = ${JSON.stringify(rows, null, 2)};

export const PACK: CuratedPack = {
  id: "curated-core",
  version: "2.0.0",
  title: "Luoghi iconici",
  description:
    "Capitali, città, monumenti, isole e luoghi naturali selezionati e descritti a mano dalla redazione MondoGioco.",
  sourceId: "curated",
  rows: ROWS,
};

export default PACK;
`;

const out = resolve(root, "data/content/packs/curated-core.ts");
writeFileSync(out, header, "utf8");
console.log(`✓ ${rows.length} luoghi migrati in data/content/packs/curated-core.ts`);
