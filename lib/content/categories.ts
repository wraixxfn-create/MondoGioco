// ============================================================
// MondoGioco — Registro delle categorie di luoghi
// ============================================================
//
// Le categorie NON sono un'unione chiusa di stringhe: sono voci di un
// registro estendibile. Per introdurre una nuova categoria (per esempio
// "vulcano" o "parco nazionale") basta aggiungere un pacchetto che la
// usa e, volendo, registrarne la definizione con `registerCategory()`:
//
//   registerCategory({ id: "volcano", label: "Vulcano", ... });
//
// Il motore di gioco, la selezione dei round e i filtri non cambiano:
// le categorie sconosciute ricevono una definizione di fallback
// (`fallbackCategory()`), così il gioco continua a funzionare anche se
// un pacchetto di dati introduce una categoria non ancora registrata.

import type { CategoryId, ThemeId } from "@/data/content/schema";

/**
 * Stile con cui vengono generati gli indizi quando il record non ne
 * ha di scritti a mano.
 * - "settlement": insediamento umano (città, capitale, villaggio)
 * - "point": punto geografico singolo (cima, monumento, sito, isola)
 * - "line": elemento lineare o areale (fiume, lago): si indica il punto
 *   rappresentativo scelto (foce, sorgente, centro lago)
 * - "custom": nessuna generazione automatica (richiede indizi scritti)
 */
export type HintStyle = "settlement" | "point" | "line" | "custom";

export interface CategoryDefinition {
  id: CategoryId;
  /** Etichetta singolare in italiano (interfaccia). */
  label: string;
  /** Etichetta plurale in italiano. */
  plural: string;
  /** Emoji/Icona mostrata nell'interfaccia. */
  icon: string;
  /** Descrizione breve per la schermata contenuti. */
  description: string;
  hintStyle: HintStyle;
  /** True se la categoria rappresenta un insediamento umano. */
  settlement?: boolean;
  /** Temi assegnati automaticamente ai luoghi di questa categoria. */
  defaultThemes?: ThemeId[];
  /** Ordine di presentazione (crescente). */
  order?: number;
}

const CATEGORIES = new Map<CategoryId, CategoryDefinition>();

/** Registra (o sostituisce) la definizione di una categoria. */
export function registerCategory(def: CategoryDefinition): CategoryDefinition {
  CATEGORIES.set(def.id, def);
  return def;
}

/** Registra più categorie in una volta. */
export function registerCategories(defs: CategoryDefinition[]): void {
  for (const def of defs) registerCategory(def);
}

/**
 * Definizione di fallback per categorie introdotte dai dati ma non
 * ancora registrate: il gioco resta funzionante, l'etichetta è il
 * codice della categoria "umanizzato".
 */
export function fallbackCategory(id: CategoryId): CategoryDefinition {
  const humanized = id.replace(/[-_]+/g, " ").trim();
  const label = humanized.charAt(0).toUpperCase() + humanized.slice(1);
  return {
    id,
    label,
    plural: label,
    icon: "📍",
    description: "Categoria personalizzata (definizione non registrata).",
    hintStyle: "custom",
  };
}

/** Definizione di una categoria (con fallback per quelle sconosciute). */
export function getCategory(id: CategoryId): CategoryDefinition {
  return CATEGORIES.get(id) ?? fallbackCategory(id);
}

/** Tutte le categorie registrate, ordinate per `order` poi per etichetta. */
export function listCategories(): CategoryDefinition[] {
  return [...CATEGORIES.values()].sort(
    (a, b) => (a.order ?? 999) - (b.order ?? 999) || a.label.localeCompare(b.label, "it")
  );
}

/** Etichetta italiana di una categoria (sicura anche per id sconosciuti). */
export function categoryLabel(id: CategoryId): string {
  return getCategory(id).label;
}

/** Icona di una categoria (sicura anche per id sconosciuti). */
export function categoryIcon(id: CategoryId): string {
  return getCategory(id).icon;
}

// ------------------------------------------------------------
// Categorie di base del progetto
// ------------------------------------------------------------

registerCategories([
  {
    id: "capital",
    label: "Capitale",
    plural: "Capitali",
    icon: "🏛️",
    description: "Capitali di stato e territori (fonte: GeoNames, feature code PPLC).",
    hintStyle: "settlement",
    settlement: true,
    defaultThemes: ["capitals"],
    order: 10,
  },
  {
    id: "city",
    label: "Città",
    plural: "Città",
    icon: "🏙️",
    description: "Città e centri abitati di ogni dimensione (fonte: GeoNames).",
    hintStyle: "settlement",
    settlement: true,
    order: 20,
  },
  {
    id: "monument",
    label: "Monumento",
    plural: "Monumenti",
    icon: "🗼",
    description: "Costruzioni e architetture iconiche, antiche e moderne.",
    hintStyle: "point",
    defaultThemes: ["wonder"],
    order: 30,
  },
  {
    id: "mountain",
    label: "Montagna",
    plural: "Montagne",
    icon: "⛰️",
    description: "Vette, massicci e catene montuose (punto: la cima o il corpo principale).",
    hintStyle: "point",
    defaultThemes: ["highland"],
    order: 40,
  },
  {
    id: "river",
    label: "Fiume",
    plural: "Fiumi",
    icon: "🏞️",
    description: "Corsi d'acqua; il punto indicato è la foce o un tratto rappresentativo.",
    hintStyle: "line",
    defaultThemes: ["water"],
    order: 50,
  },
  {
    id: "lake",
    label: "Lago",
    plural: "Laghi",
    icon: "💧",
    description: "Laghi e bacini; il punto indicato è il centro del bacino.",
    hintStyle: "line",
    defaultThemes: ["water"],
    order: 60,
  },
  {
    id: "island",
    label: "Isola",
    plural: "Isole",
    icon: "🏝️",
    description: "Isole e arcipelaghi; il punto indicato è il centro dell'isola.",
    hintStyle: "point",
    defaultThemes: ["island"],
    order: 70,
  },
  {
    id: "historic",
    label: "Luogo storico",
    plural: "Luoghi storici",
    icon: "🏺",
    description: "Siti archeologici, città antiche e luoghi di interesse storico.",
    hintStyle: "point",
    defaultThemes: ["ancient"],
    order: 80,
  },
  {
    id: "nature",
    label: "Natura",
    plural: "Luoghi naturali",
    icon: "🌋",
    description: "Altri luoghi naturali: deserti, foreste, cascate, ghiacciai, parchi e vulcani.",
    hintStyle: "point",
    order: 90,
  },
]);
