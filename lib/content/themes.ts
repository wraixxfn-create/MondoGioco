// ============================================================
// MondoGioco — Registro dei temi (tag trasversali)
// ============================================================
//
// I temi sono etichette attribuite ai luoghi indipendentemente dalla
// categoria: permettono di costruire mappe tematiche ("Le capitali del
// mondo", "I grandi fiumi", "Città costiere") incrociando categorie,
// continenti e difficoltà senza duplicare i dati.
//
// Come le categorie, i temi sono estendibili a runtime: un tema non
// registrato riceve un'etichetta di fallback.

import type { ThemeId } from "@/data/content/schema";

export interface ThemeDefinition {
  id: ThemeId;
  /** Etichetta italiana. */
  label: string;
  icon: string;
  /** Descrizione mostrata nell'interfaccia. */
  description: string;
  /** Ordine di presentazione (crescente). */
  order?: number;
}

const THEMES = new Map<ThemeId, ThemeDefinition>();

export function registerTheme(def: ThemeDefinition): ThemeDefinition {
  THEMES.set(def.id, def);
  return def;
}

function fallbackTheme(id: ThemeId): ThemeDefinition {
  const humanized = id.replace(/[-_]+/g, " ").trim();
  const label = humanized.charAt(0).toUpperCase() + humanized.slice(1);
  return { id, label, icon: "🏷️", description: "Tema personalizzato." };
}

export function getTheme(id: ThemeId): ThemeDefinition {
  return THEMES.get(id) ?? fallbackTheme(id);
}

export function themeLabel(id: ThemeId): string {
  return getTheme(id).label;
}

export function listThemes(): ThemeDefinition[] {
  return [...THEMES.values()].sort(
    (a, b) => (a.order ?? 999) - (b.order ?? 999) || a.label.localeCompare(b.label, "it")
  );
}

registerTheme({
  id: "capitals",
  label: "Capitali",
  icon: "🏛️",
  description: "Capitali di stato e di territorio.",
  order: 10,
});
registerTheme({
  id: "metropolis",
  label: "Metropoli",
  icon: "🏙️",
  description: "Città sopra il milione di abitanti.",
  order: 20,
});
registerTheme({
  id: "megacity",
  label: "Megalopoli",
  icon: "🌆",
  description: "Aree urbane sopra i 5 milioni di abitanti.",
  order: 25,
});
registerTheme({
  id: "coastal",
  label: "Costiero",
  icon: "🌊",
  description: "Luoghi entro 25 km dalla costa.",
  order: 30,
});
registerTheme({
  id: "island",
  label: "Insulare",
  icon: "🏝️",
  description: "Isole, arcipelaghi e territori insulari.",
  order: 40,
});
registerTheme({
  id: "highland",
  label: "Montagna",
  icon: "⛰️",
  description: "Rilievi, catene montuose e altopiani.",
  order: 50,
});
registerTheme({
  id: "water",
  label: "Acque interne",
  icon: "💧",
  description: "Fiumi, laghi e grandi bacini.",
  order: 60,
});
registerTheme({
  id: "desert",
  label: "Arido",
  icon: "🏜️",
  description: "Deserti e regioni aride.",
  order: 70,
});
registerTheme({
  id: "polar",
  label: "Polare",
  icon: "🧊",
  description: "Ghiacciai, calotte polari e alte latitudini.",
  order: 80,
});
registerTheme({
  id: "volcano",
  label: "Vulcanico",
  icon: "🌋",
  description: "Vulcani e aree di origine vulcanica.",
  order: 90,
});
registerTheme({
  id: "ancient",
  label: "Antico",
  icon: "🏺",
  description: "Siti archeologici e città dell'antichità.",
  order: 100,
});
registerTheme({
  id: "wonder",
  label: "Iconico",
  icon: "✨",
  description: "Architetture e luoghi celebri in tutto il mondo.",
  order: 110,
});
registerTheme({
  id: "religious",
  label: "Luogo di culto",
  icon: "🕊️",
  description: "Luoghi di culto e pellegrinaggio.",
  order: 120,
});
registerTheme({
  id: "remote",
  label: "Remoto",
  icon: "🧭",
  description: "Luoghi isolati o difficilmente raggiungibili.",
  order: 130,
});
registerTheme({
  id: "border",
  label: "Transfrontaliero",
  icon: "🪧",
  description: "Luoghi che attraversano o separano più stati.",
  order: 140,
});
