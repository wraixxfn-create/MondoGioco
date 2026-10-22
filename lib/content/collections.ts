// ============================================================
// MondoGioco — Mappe tematiche e pacchetti di sfida
// ============================================================
// Una "collezione" è SOLO dati: un filtro dichiarativo più (per i
// pacchetti di sfida) un piano di gioco. Questo significa che introdurre
// una nuova mappa tematica o una nuova sfida non richiede di toccare né
// il generatore di round né il motore di gioco.
//
// - `thematic`: mappa tematica, cioè una lente sul dataset (es. "I grandi
//   fiumi") usata per esplorare e per filtrare i round.
// - `challenge`: pacchetto di sfida, cioè una partita preconfezionata con
//   numero di round, distribuzione della difficoltà e modalità consigliata.

import type { FilterCriteria } from "./catalog";
import type { RoundPlan } from "./selection";
import type { GeoGameMode } from "@/types";

export type CollectionKind = "thematic" | "challenge";

export interface ContentCollection {
  id: string;
  kind: CollectionKind;
  title: string;
  description: string;
  icon: string;
  /** Classi Tailwind per la scheda (coerenti col resto dell'interfaccia). */
  accent: string;
  criteria: FilterCriteria;
}

export interface ChallengePack extends ContentCollection {
  kind: "challenge";
  /** Round previsti dalla sfida. */
  rounds: number;
  /** Piano di selezione (distribuzione difficoltà, vincoli geografici). */
  plan: RoundPlan;
  /** Modalità consigliata (l'interfaccia la preseleziona). */
  recommendedMode: GeoGameMode;
}

export const COLLECTIONS: (ContentCollection | ChallengePack)[] = [
  // ---------------------- Mappe tematiche ----------------------
  {
    id: "map-capitals",
    kind: "thematic",
    title: "Capitali del mondo",
    description: "Tutte le capitali di Stato e territorio presenti nel dataset.",
    icon: "🏛️",
    accent: "from-amber-400 to-orange-500",
    criteria: { categories: ["capital"] },
  },
  {
    id: "map-mountains",
    kind: "thematic",
    title: "Montagne e vulcani",
    description: "Dalle cime himalayane ai vulcani attivi del Mediterraneo.",
    icon: "⛰️",
    accent: "from-slate-400 to-slate-600",
    criteria: { categories: ["mountain"] },
  },
  {
    id: "map-water",
    kind: "thematic",
    title: "Fiumi e laghi",
    description: "Grandi corsi d'acqua e bacini di ogni continente.",
    icon: "💧",
    accent: "from-sky-400 to-blue-600",
    criteria: { categories: ["river", "lake"] },
  },
  {
    id: "map-history",
    kind: "thematic",
    title: "Sulle tracce della storia",
    description: "Siti archeologici, città antiche e luoghi di memoria.",
    icon: "🏺",
    accent: "from-amber-600 to-yellow-700",
    criteria: { categories: ["historic"] },
  },
  {
    id: "map-coasts",
    kind: "thematic",
    title: "Coste e isole",
    description: "Luoghi entro 25 km dal mare, isole e arcipelaghi.",
    icon: "🏝️",
    accent: "from-cyan-400 to-teal-500",
    criteria: { themes: ["coastal", "island"] },
  },
  {
    id: "map-extremes",
    kind: "thematic",
    title: "Ambienti estremi",
    description: "Deserti, ghiacciai, alte latitudini e luoghi remoti.",
    icon: "🧊",
    accent: "from-indigo-400 to-violet-600",
    criteria: { themes: ["desert", "polar", "remote"] },
  },
  {
    id: "map-megacities",
    kind: "thematic",
    title: "Megalopoli",
    description: "Aree urbane sopra i 5 milioni di abitanti.",
    icon: "🌆",
    accent: "from-fuchsia-500 to-pink-600",
    criteria: { themes: ["megacity"] },
  },
  // ---------------------- Pacchetti di sfida ----------------------
  {
    id: "challenge-europe-capitals",
    kind: "challenge",
    title: "Capitali d'Europa",
    description: "Sei capitali europee, difficoltà crescente.",
    icon: "🇪🇺",
    accent: "from-blue-500 to-indigo-600",
    criteria: { categories: ["capital"], continents: ["europe"] },
    rounds: 6,
    plan: { ramp: true, minSeparationKm: 40, maxPerCountry: 1 },
    recommendedMode: "challenge",
  },
  {
    id: "challenge-world-capitals",
    kind: "challenge",
    title: "Capitali del mondo",
    description: "Otto capitali da tutti i continenti: una per continente, se possibile.",
    icon: "🌐",
    accent: "from-emerald-500 to-teal-600",
    criteria: { categories: ["capital"] },
    rounds: 8,
    plan: { difficultyMix: { 1: 0.4, 2: 0.4, 3: 0.2 }, maxPerContinent: 2, maxPerCountry: 1 },
    recommendedMode: "challenge",
  },
  {
    id: "challenge-summits",
    kind: "challenge",
    title: "Sfida delle vette",
    description: "Cinque montagne celebri: precisione, non velocità.",
    icon: "🏔️",
    accent: "from-slate-500 to-slate-700",
    criteria: { categories: ["mountain"] },
    rounds: 5,
    plan: { difficultyMix: { 1: 0.2, 2: 0.4, 3: 0.4 }, minSeparationKm: 60 },
    recommendedMode: "precision",
  },
  {
    id: "challenge-rivers-lakes",
    kind: "challenge",
    title: "Acque del mondo",
    description: "Fiumi e laghi: sei round fra foce, bacini e delta.",
    icon: "🏞️",
    accent: "from-sky-500 to-cyan-600",
    criteria: { categories: ["river", "lake"] },
    rounds: 6,
    plan: { difficultyMix: { 1: 0.3, 2: 0.4, 3: 0.3 }, minSeparationKm: 100 },
    recommendedMode: "challenge",
  },
  {
    id: "challenge-antiquity",
    kind: "challenge",
    title: "Antichità",
    description: "Sei siti archeologici, dalla Mesopotamia alle Ande.",
    icon: "🏛️",
    accent: "from-amber-500 to-orange-600",
    criteria: { categories: ["historic"] },
    rounds: 6,
    plan: { difficultyMix: { 1: 0.2, 2: 0.3, 3: 0.5 }, minSeparationKm: 120 },
    recommendedMode: "challenge",
  },
  {
    id: "challenge-megacities-sprint",
    kind: "challenge",
    title: "Sprint megalopoli",
    description: "Cinque metropoli da oltre un milione di abitanti, 15 secondi l'una.",
    icon: "⚡",
    accent: "from-rose-500 to-pink-600",
    criteria: { themes: ["metropolis", "megacity"] },
    rounds: 5,
    plan: { difficultyMix: { 1: 0.6, 2: 0.4, 3: 0 }, minSeparationKm: 200, maxPerCountry: 1 },
    recommendedMode: "sprint",
  },
  {
    id: "challenge-italy",
    kind: "challenge",
    title: "Viaggio in Italia",
    description: "Città, monti, fiumi e isole italiane.",
    icon: "🇮🇹",
    accent: "from-green-500 to-emerald-600",
    criteria: { countries: ["IT"] },
    rounds: 8,
    plan: { difficultyMix: { 1: 0.3, 2: 0.4, 3: 0.3 }, minSeparationKm: 40 },
    recommendedMode: "challenge",
  },
  {
    id: "challenge-global-marathon",
    kind: "challenge",
    title: "Maratona mondiale",
    description: "Dieci round senza filtri: difficoltà in crescita e continenti diversi.",
    icon: "🧭",
    accent: "from-indigo-500 to-purple-600",
    criteria: {},
    rounds: 10,
    plan: { ramp: true, minSeparationKm: 250, maxPerContinent: 3, maxPerCountry: 1 },
    recommendedMode: "challenge",
  },
];

export function listCollections(kind?: CollectionKind): (ContentCollection | ChallengePack)[] {
  return kind ? COLLECTIONS.filter((collection) => collection.kind === kind) : COLLECTIONS;
}

export function getCollection(id: string): ContentCollection | ChallengePack | undefined {
  return COLLECTIONS.find((collection) => collection.id === id);
}

export function isChallengePack(
  collection: ContentCollection | ChallengePack
): collection is ChallengePack {
  return collection.kind === "challenge";
}
