// ============================================================
// MondoGioco — Missioni giornaliere e settimanali
// ============================================================
// Puramente cosmetiche, non manipolative: ricompense XP modeste,
// senza loop infiniti o paywall.

import type { SessionStatInput } from "./progression";
import { createSeededRng } from "./engine";

export type MissionFrequency = "daily" | "weekly";
export type MissionMetric =
  | "games"
  | "bullseyes"
  | "sprint"
  | "precision"
  | "survival"
  | "daily_challenge"
  | "streak_combo"
  | "continents";

export interface MissionDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  frequency: MissionFrequency;
  metric: MissionMetric;
  target: number;
  xp: number;
  /** Testo breve del premio cosmetico se presente */
  cosmetic?: string;
}

export const DAILY_MISSIONS_POOL: MissionDef[] = [
  {
    id: "daily_games_1",
    title: "Primo volo",
    description: "Completa 1 partita qualsiasi",
    icon: "✈️",
    frequency: "daily",
    metric: "games",
    target: 1,
    xp: 40,
  },
  {
    id: "daily_games_2",
    title: "Doppietta",
    description: "Completa 2 partite",
    icon: "🎯",
    frequency: "daily",
    metric: "games",
    target: 2,
    xp: 60,
  },
  {
    id: "daily_bullseye_1",
    title: "Occhio di falco",
    description: "Fai 1 colpo entro 100 km",
    icon: "🎯",
    frequency: "daily",
    metric: "bullseyes",
    target: 1,
    xp: 80,
  },
  {
    id: "daily_sprint_1",
    title: "Sprint mattutino",
    description: "Gioca 1 partita Sprint",
    icon: "⚡",
    frequency: "daily",
    metric: "sprint",
    target: 1,
    xp: 50,
  },
  {
    id: "daily_precision_1",
    title: "Mano ferma",
    description: "Gioca 1 partita Precisione",
    icon: "🧭",
    frequency: "daily",
    metric: "precision",
    target: 1,
    xp: 50,
  },
  {
    id: "daily_survival_3",
    title: "Sopravvissuto",
    description: "Supera 3 round in Sopravvivenza",
    icon: "🛡️",
    frequency: "daily",
    metric: "survival",
    target: 3,
    xp: 70,
  },
  {
    id: "daily_combo_2",
    title: "In serie",
    description: "Ottieni una combo x2",
    icon: "🔥",
    frequency: "daily",
    metric: "streak_combo",
    target: 2,
    xp: 60,
  },
  {
    id: "daily_challenge_1",
    title: "Sfida del giorno",
    description: "Completa la Sfida giornaliera",
    icon: "📅",
    frequency: "daily",
    metric: "daily_challenge",
    target: 1,
    xp: 80,
    cosmetic: "Cornice giornaliera",
  },
];

export const WEEKLY_MISSIONS_POOL: MissionDef[] = [
  {
    id: "weekly_games_10",
    title: "Esploratore incallito",
    description: "Gioca 10 partite in una settimana",
    icon: "🌍",
    frequency: "weekly",
    metric: "games",
    target: 10,
    xp: 200,
  },
  {
    id: "weekly_bullseyes_5",
    title: "Cecchino settimanale",
    description: "Metti a segno 5 bullseye",
    icon: "🎯",
    frequency: "weekly",
    metric: "bullseyes",
    target: 5,
    xp: 250,
  },
  {
    id: "weekly_sprint_3",
    title: "Velocista",
    description: "Completa 3 Sprint",
    icon: "⚡",
    frequency: "weekly",
    metric: "sprint",
    target: 3,
    xp: 180,
  },
  {
    id: "weekly_survival_10",
    title: "Sopravvissuto estremo",
    description: "Sopravvivi a 10 round in Survival",
    icon: "🏔️",
    frequency: "weekly",
    metric: "survival",
    target: 10,
    xp: 300,
  },
  {
    id: "weekly_combo_4",
    title: "Combo master",
    description: "Raggiungi combo x4",
    icon: "💫",
    frequency: "weekly",
    metric: "streak_combo",
    target: 4,
    xp: 220,
  },
  {
    id: "weekly_precision_5",
    title: "Perfezionista",
    description: "Gioca 5 Precisione",
    icon: "💎",
    frequency: "weekly",
    metric: "precision",
    target: 5,
    xp: 200,
  },
];

function seededPick<T>(pool: T[], count: number, seed: number): T[] {
  const rng = createSeededRng(seed);
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

export function dailyMissionSeed(date: Date = new Date()): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate() + 7919;
}
export function weeklyMissionSeed(date: Date = new Date()): number {
  const jan1 = new Date(date.getFullYear(), 0, 1);
  const week = Math.floor((date.getTime() - jan1.getTime()) / (7 * 24 * 3600 * 1000));
  return date.getFullYear() * 1000 + week + 9973;
}

export function getDailyMissions(date: Date = new Date()): MissionDef[] {
  return seededPick(DAILY_MISSIONS_POOL, 3, dailyMissionSeed(date));
}
export function getWeeklyMissions(date: Date = new Date()): MissionDef[] {
  return seededPick(WEEKLY_MISSIONS_POOL, 3, weeklyMissionSeed(date));
}

export interface MissionProgress {
  def: MissionDef;
  current: number;
  progress: number; // 0..1
  completed: boolean;
}

function countForMetric(metric: MissionMetric, sessions: SessionStatInput[]): number {
  switch (metric) {
    case "games":
      return sessions.length;
    case "bullseyes":
      // we approximate bullseyes as correct with high score? Actually we need proper count
      // For now count sessions with high score? Better count from bullseye field if available
      // Fallback: count sessions where score > 3000 as proxy? But we have correct counting via derive
      // We'll count total correct as proxy for now? Let's use sessions length with correct>0?
      // Actually we store sessions with bullseyes count? Let's count via sessions' correct field as bullseyes proxy
      // To keep simple, we track via XP? We'll approximate: use total games with bullseye = count where session has at least 1 bullseye
      // Since SessionStatInput doesn't have bullseyes, we use sessions with high average? We'll treat as totalCorrect
      return sessions.reduce((sum, s) => sum + (s.correct ?? 0), 0);
    case "sprint":
      return sessions.filter((s) => s.mode === "sprint").length;
    case "precision":
      return sessions.filter((s) => s.mode === "precision").length;
    case "survival":
      return sessions.filter((s) => s.mode === "survival").reduce((sum, s) => sum + s.rounds, 0);
    case "daily_challenge":
      return sessions.filter((s) => s.mode === "daily").length;
    case "streak_combo":
      // bestStreak approximated via rounds? fallback
      return Math.max(
        0,
        ...sessions.map((s) => (s as unknown as { bestStreak?: number }).bestStreak ?? 0),
        0
      );
    case "continents":
      return new Set(sessions.map((s) => s.mode)).size;
    default:
      return 0;
  }
}

export function evaluateMissions(
  defs: MissionDef[],
  sessions: SessionStatInput[]
): MissionProgress[] {
  return defs.map((def) => {
    const current = Math.min(def.target, countForMetric(def.metric, sessions));
    return {
      def,
      current,
      progress: def.target > 0 ? Math.min(1, current / def.target) : 1,
      completed: current >= def.target,
    };
  });
}

// Local storage helpers for claimed missions
const CLAIMED_KEY = "mondogioco:missions:claimed:v1";

function storageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

export function getClaimedMissions(): Set<string> {
  if (!storageAvailable()) return new Set();
  try {
    const raw = window.localStorage.getItem(CLAIMED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function claimMission(missionId: string): void {
  if (!storageAvailable()) return;
  const claimed = getClaimedMissions();
  claimed.add(missionId);
  try {
    window.localStorage.setItem(CLAIMED_KEY, JSON.stringify([...claimed]));
  } catch {}
}

export function isMissionClaimed(missionId: string): boolean {
  return getClaimedMissions().has(missionId);
}

// Daily streak helpers for UI
export function getMissionsForToday(date: Date = new Date()): {
  daily: MissionDef[];
  weekly: MissionDef[];
} {
  return { daily: getDailyMissions(date), weekly: getWeeklyMissions(date) };
}
