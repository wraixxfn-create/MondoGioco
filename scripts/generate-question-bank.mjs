#!/usr/bin/env node
/**
 * Genera `supabase/migrations/004_question_bank_seed.sql` a partire da
 * `data/countries.ts`.
 *
 * Perché un file generato e non un seed "a runtime"?
 * Il multiplayer è autoritativo: le domande e le risposte corrette devono
 * vivere nel database, non nel client. La banca domande così generata è
 * deterministica (PRNG con seed derivato da paese + tipo) e versionata.
 *
 * Uso: node scripts/generate-question-bank.mjs
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = resolve(root, "data/countries.ts");
const tmpPath = resolve(root, "data/.countries.generated.mjs");
const outPath = resolve(root, "supabase/migrations/004_question_bank_seed.sql");

const source = readFileSync(srcPath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;

writeFileSync(tmpPath, transpiled);
const { COUNTRIES } = await import(`file://${tmpPath}`);
unlinkSync(tmpPath);

const CONTINENT_LABELS = {
  europe: "Europa",
  asia: "Asia",
  africa: "Africa",
  north_america: "Nord America",
  south_america: "Sud America",
  oceania: "Oceania",
  antarctica: "Antartide",
};

/** PRNG deterministico (mulberry32) */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededShuffle(items, seed) {
  const rand = mulberry32(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Difficoltà = terzili di notorietà (proxy: popolazione).
// Garantisce tre bucket bilanciati e deterministici qualunque sia il dataset.
const RANKED_BY_POPULATION = [...COUNTRIES].sort((a, b) => b.population - a.population);
const DIFFICULTY_BY_ID = new Map(
  RANKED_BY_POPULATION.map((country, index) => {
    const third = RANKED_BY_POPULATION.length / 3;
    if (index < third) return [country.id, "easy"];
    if (index < third * 2) return [country.id, "medium"];
    return [country.id, "hard"];
  })
);

function difficultyFor(country) {
  return DIFFICULTY_BY_ID.get(country.id) ?? "medium";
}

function pickDistractors(country, count, forbid) {
  const pool = COUNTRIES.filter(
    (c) => c.id !== country.id && !forbid.includes(c.name) && !forbid.includes(c.capital)
  );
  return seededShuffle(pool, seedFrom(`${country.id}:distractors`)).slice(0, count);
}

const rows = [];

for (const country of COUNTRIES) {
  const difficulty = difficultyFor(country);
  const countryMeta = {
    name: country.name,
    flag: country.flag,
    iso: country.iso,
  };

  // --- Capitali ---
  {
    const distractors = pickDistractors(country, 3, [country.capital]);
    const options = seededShuffle(
      [country.capital, ...distractors.map((d) => d.capital)],
      seedFrom(`${country.id}:capital:options`)
    );
    rows.push({
      id: `capital_${country.iso.toLowerCase()}_${difficulty}`,
      quiz_type: "capital",
      difficulty,
      prompt: `Qual è la capitale di ${country.name}?`,
      options,
      correct_answer: country.capital,
      country: countryMeta,
    });
  }

  // --- Bandiere ---
  {
    const distractors = pickDistractors(country, 3, [country.name]);
    const options = seededShuffle(
      [country.name, ...distractors.map((d) => d.name)],
      seedFrom(`${country.id}:flag:options`)
    );
    rows.push({
      id: `flag_${country.iso.toLowerCase()}_${difficulty}`,
      quiz_type: "flag",
      difficulty,
      prompt: `A quale paese appartiene questa bandiera? ${country.flag}`,
      options,
      correct_answer: country.name,
      country: countryMeta,
    });
  }

  // --- Continenti ---
  {
    const label = CONTINENT_LABELS[country.continent];
    const others = Object.entries(CONTINENT_LABELS)
      .filter(([key]) => key !== country.continent && key !== "antarctica")
      .map(([, value]) => value);
    const options = seededShuffle(
      [label, ...seededShuffle(others, seedFrom(`${country.id}:continent`)).slice(0, 3)],
      seedFrom(`${country.id}:continent:options`)
    );
    rows.push({
      id: `continent_${country.iso.toLowerCase()}_${difficulty}`,
      quiz_type: "continent",
      difficulty,
      prompt: `In quale continente si trova ${country.name}?`,
      options,
      correct_answer: label,
      country: countryMeta,
    });
  }

  // --- Popolazione (4 paesi, vince il più popoloso) ---
  {
    const distractors = pickDistractors(country, 3, [country.name]);
    const group = [country, ...distractors];
    const mostPopulous = [...group].sort((a, b) => b.population - a.population)[0];
    const options = seededShuffle(
      group.map((c) => c.name),
      seedFrom(`${country.id}:population:options`)
    );
    rows.push({
      id: `population_${country.iso.toLowerCase()}_${difficulty}`,
      quiz_type: "population",
      difficulty,
      prompt: "Quale di questi paesi ha la popolazione maggiore?",
      options,
      correct_answer: mostPopulous.name,
      country: countryMeta,
    });
  }
}

// --- Validazione ---
const stats = new Map();
const seenIds = new Set();
for (const row of rows) {
  if (seenIds.has(row.id)) throw new Error(`ID duplicato: ${row.id}`);
  seenIds.add(row.id);
  if (!row.options.includes(row.correct_answer)) {
    throw new Error(`Risposta corretta non tra le opzioni per ${row.id}`);
  }
  if (new Set(row.options).size !== row.options.length) {
    throw new Error(`Opzioni duplicate per ${row.id}`);
  }
  if (row.options.length !== 4) throw new Error(`Opzioni non valide per ${row.id}`);
  const key = `${row.quiz_type}:${row.difficulty}`;
  stats.set(key, (stats.get(key) ?? 0) + 1);
}

for (const [key, count] of [...stats.entries()].sort()) {
  if (count < 10) {
    throw new Error(
      `Poche domande per ${key}: ${count}. Servono almeno 10 (max round = 15 con fallback).`
    );
  }
  console.log(`${key}: ${count}`);
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

const values = rows
  .map(
    (row) =>
      `  (${sqlString(row.id)}, ${sqlString(row.quiz_type)}, ${sqlString(row.difficulty)}, ` +
      `${sqlString(row.prompt)}, ${sqlJson(row.options)}, ${sqlString(row.correct_answer)}, ` +
      `${sqlString(row.country.name)}, ${sqlString(row.country.flag)}, ${sqlString(row.country.iso)})`
  )
  .join(",\n");

const sql = `-- ============================================================
-- MondoGioco — Migrazione 004
-- Banca domande del multiplayer (GENERATA AUTOMATICAMENTE)
-- ============================================================
-- File generato da \`scripts/generate-question-bank.mjs\` a partire da
-- \`data/countries.ts\`. NON modificare a mano: rigenera con
--   node scripts/generate-question-bank.mjs
--
-- Le risposte corrette vivono in questa tabella privata (schema app_private,
-- non esposto da PostgREST). Il client riceve solo prompt e opzioni.
-- Difficoltà = terzili di notorietà (proxy: popolazione del paese):
--   easy = terzo più popoloso, medium = terzo intermedio, hard = terzo meno popoloso.
-- ============================================================

INSERT INTO app_private.question_bank
  (id, quiz_type, difficulty, prompt, options, correct_answer, country_name, country_flag, country_iso)
VALUES
${values}
ON CONFLICT (id) DO UPDATE SET
  quiz_type = EXCLUDED.quiz_type,
  difficulty = EXCLUDED.difficulty,
  prompt = EXCLUDED.prompt,
  options = EXCLUDED.options,
  correct_answer = EXCLUDED.correct_answer,
  country_name = EXCLUDED.country_name,
  country_flag = EXCLUDED.country_flag,
  country_iso = EXCLUDED.country_iso;

-- Solo il backend (funzioni security definer) può leggere la banca domande.
REVOKE ALL ON app_private.question_bank FROM PUBLIC;
`;

writeFileSync(outPath, sql);
console.log(`\nScritte ${rows.length} domande in ${outPath}`);
