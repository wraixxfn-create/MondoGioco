import type { LevelInfo } from "@/types";

/**
 * Livello massimo supportato. Coerente con `app_private.level_from_xp`
 * (migrazione 002), che si ferma a 200: oltre quella soglia il progresso
 * non deve più divergere tra client e server.
 */
export const MAX_LEVEL = 200;

/**
 * Calcola le informazioni sul livello in base all'XP.
 * Formula: xpPerLevel = 100 * level^1.5
 *
 * Robustezza: XP non finito (NaN/Infinity, possibile se il localStorage è
 * corrotto o un payload cloud è malformato) o negativo non deve mai
 * bloccare il loop. Prima di questa guardia `calculateLevel(NaN)` non
 * terminava mai, congelando l'intera pagina.
 */
export function calculateLevel(xp: number): LevelInfo {
  const safeXp = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  let level = 1;
  let totalXpRequired = 0;

  while (level < MAX_LEVEL) {
    const xpForThisLevel = Math.floor(100 * Math.pow(level, 1.5));
    if (totalXpRequired + xpForThisLevel > safeXp) break;
    totalXpRequired += xpForThisLevel;
    level += 1;
  }

  const xpForThisLevel = Math.floor(100 * Math.pow(level, 1.5));
  const currentLevelXp = Math.max(0, safeXp - totalXpRequired);
  return {
    level,
    currentXp: currentLevelXp,
    xpForNextLevel: xpForThisLevel,
    progress: Math.min(100, (currentLevelXp / xpForThisLevel) * 100),
  };
}

/**
 * Formatta un numero con separatore delle migliaia.
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat("it-IT").format(num);
}

/**
 * Classe helper per gestire il nome del continente.
 */
export function continentLabel(continent: string): string {
  const labels: Record<string, string> = {
    europe: "Europa",
    asia: "Asia",
    africa: "Africa",
    north_america: "Nord America",
    south_america: "Sud America",
    oceania: "Oceania",
    antarctica: "Antartide",
  };
  return labels[continent] ?? continent;
}

export function difficultyLabel(difficulty: string): string {
  const labels: Record<string, string> = {
    easy: "Facile",
    medium: "Medio",
    hard: "Difficile",
  };
  return labels[difficulty] ?? difficulty;
}

export function quizTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    capital: "Capitali",
    flag: "Bandiere",
    population: "Popolazione",
    continent: "Continenti",
  };
  return labels[type] ?? type;
}
