import type { LevelInfo } from "@/types";

/**
 * Calcola le informazioni sul livello in base all'XP.
 * Formula: xpPerLevel = 100 * level^1.5
 */
export function calculateLevel(xp: number): LevelInfo {
  let level = 1;
  let totalXpRequired = 0;

  while (true) {
    const xpForThisLevel = Math.floor(100 * Math.pow(level, 1.5));
    if (totalXpRequired + xpForThisLevel > xp) {
      const currentLevelXp = xp - totalXpRequired;
      return {
        level,
        currentXp: currentLevelXp,
        xpForNextLevel: xpForThisLevel,
        progress: Math.min(100, (currentLevelXp / xpForThisLevel) * 100),
      };
    }
    totalXpRequired += xpForThisLevel;
    level++;
  }
}

/**
 * Calcola i punti guadagnati in base alla velocità di risposta.
 * Base: 100 punti, bonus tempo fino a 100 punti extra.
 */
export function calculatePoints(isCorrect: boolean, timeSpent: number, timeLimit: number): number {
  if (!isCorrect) return 0;
  const basePoints = 100;
  const timeBonus = Math.max(0, Math.floor((1 - timeSpent / timeLimit) * 100));
  return basePoints + timeBonus;
}

/**
 * Genera un codice stanza casuale di 6 caratteri alfanumerici.
 */
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // senza caratteri ambigui
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Mescola un array in modo casuale (Fisher-Yates shuffle).
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Formatta un numero con separatore delle migliaia.
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat("it-IT").format(num);
}

/**
 * Converte coordinate lat/lng in coordinate 3D sulla sfera.
 */
export function latLngToVector3(
  lat: number,
  lng: number,
  radius: number
): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return [x, y, z];
}

/**
 * Calcola la distanza approssimativa in km tra due punti usando la formula di Haversine.
 */
export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Raggio terrestre in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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
    location: "Posizione",
    population: "Popolazione",
    continent: "Continenti",
  };
  return labels[type] ?? type;
}
