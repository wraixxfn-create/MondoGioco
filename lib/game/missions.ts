// ============================================================
// MondoGioco — Missioni giornaliere e settimanali
// ============================================================
// Obiettivi di pratica (giornalieri/settimanali) calcolati dallo storico
// REALE del dispositivo. Non assegnano XP: una ricompensa deve essere
// accreditata dal server (come per gli obiettivi di progressione), e una
// ricompensa solo locale sarebbe una promessa falsa. Vedi docs/PROGRESSION.md.

import type { SessionStatInput } from "./progression";
import { createSeededRng } from "./engine";

export type MissionFrequency = "daily" | "weekly";
export type MissionMetric =
  | "games"
  | "bullseyes"
  | "sprint"
  | "precision"
  | "survival_best_run"
  | "daily_challenge"
  | "streak_combo";

export interface MissionDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  frequency: MissionFrequency;
  metric: MissionMetric;
  target: number;
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
  },
  {
    id: "daily_games_2",
    title: "Doppietta",
    description: "Completa 2 partite",
    icon: "🎯",
    frequency: "daily",
    metric: "games",
    target: 2,
  },
  {
    id: "daily_bullseye_1",
    title: "Occhio di falco",
    description: "Fai 1 colpo entro 100 km",
    icon: "🎯",
    frequency: "daily",
    metric: "bullseyes",
    target: 1,
  },
  {
    id: "daily_sprint_1",
    title: "Sprint mattutino",
    description: "Gioca 1 partita Sprint",
    icon: "⚡",
    frequency: "daily",
    metric: "sprint",
    target: 1,
  },
  {
    id: "daily_precision_1",
    title: "Mano ferma",
    description: "Gioca 1 partita Precisione",
    icon: "🧭",
    frequency: "daily",
    metric: "precision",
    target: 1,
  },
  {
    id: "daily_survival_3",
    title: "Sopravvissuto",
    description: "Supera 3 round in Sopravvivenza",
    icon: "🛡️",
    frequency: "daily",
    metric: "survival_best_run",
    target: 3,
  },
  {
    id: "daily_combo_2",
    title: "In serie",
    description: "Ottieni una combo x2",
    icon: "🔥",
    frequency: "daily",
    metric: "streak_combo",
    target: 2,
  },
  {
    id: "daily_challenge_1",
    title: "Sfida del giorno",
    description: "Completa la Sfida giornaliera",
    icon: "📅",
    frequency: "daily",
    metric: "daily_challenge",
    target: 1,
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
  },
  {
    id: "weekly_bullseyes_5",
    title: "Cecchino settimanale",
    description: "Metti a segno 5 bullseye",
    icon: "🎯",
    frequency: "weekly",
    metric: "bullseyes",
    target: 5,
  },
  {
    id: "weekly_sprint_3",
    title: "Velocista",
    description: "Completa 3 Sprint",
    icon: "⚡",
    frequency: "weekly",
    metric: "sprint",
    target: 3,
  },
  {
    id: "weekly_survival_10",
    title: "Sopravvissuto estremo",
    description: "Sopravvivi a 10 round in Survival",
    icon: "🏔️",
    frequency: "weekly",
    metric: "survival_best_run",
    target: 10,
  },
  {
    id: "weekly_combo_4",
    title: "Combo master",
    description: "Raggiungi combo x4",
    icon: "💫",
    frequency: "weekly",
    metric: "streak_combo",
    target: 4,
  },
  {
    id: "weekly_precision_5",
    title: "Perfezionista",
    description: "Gioca 5 Precisione",
    icon: "💎",
    frequency: "weekly",
    metric: "precision",
    target: 5,
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
      // Colpi entro 25 km realmente registrati nella sessione.
      return sessions.reduce((sum, session) => sum + (session.bullseyes ?? 0), 0);
    case "sprint":
      return sessions.filter((session) => session.mode === "sprint").length;
    case "precision":
      return sessions.filter((session) => session.mode === "precision").length;
    case "survival_best_run":
      // Miglior singola partita: "supera N round" non è cumulabile tra run.
      return sessions
        .filter((session) => session.mode === "survival")
        .reduce((best, session) => Math.max(best, session.rounds), 0);
    case "daily_challenge":
      return sessions.filter((session) => session.mode === "daily").length;
    case "streak_combo":
      // Miglior serie combo della finestra (prima il campo non esisteva
      // nell'input: la missione non si completava mai).
      return sessions.reduce((best, session) => Math.max(best, session.bestStreak ?? 0), 0);
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
