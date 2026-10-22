import { describe, expect, it } from "vitest";
import {
  DAILY_MISSIONS_POOL,
  WEEKLY_MISSIONS_POOL,
  dailyMissionSeed,
  evaluateMissions,
  getDailyMissions,
  getWeeklyMissions,
  weeklyMissionSeed,
  type MissionDef,
} from "@/lib/game/missions";
import type { SessionStatInput } from "@/lib/game/progression";

function mission(overrides: Partial<MissionDef>): MissionDef {
  return {
    id: "test_mission",
    title: "Test",
    description: "Missione di test",
    icon: "🎯",
    frequency: "daily",
    metric: "games",
    target: 1,
    ...overrides,
  };
}

function session(overrides: Partial<SessionStatInput> = {}): SessionStatInput {
  return {
    mode: "challenge",
    score: 3000,
    rounds: 5,
    correct: 4,
    endedAt: "2026-10-22T10:00:00.000Z",
    won: false,
    bullseyes: 0,
    bestStreak: 0,
    ...overrides,
  };
}

describe("Missioni: metriche reali", () => {
  it("conta i bullseye registrati, non le risposte corrette", () => {
    const sessions = [session({ correct: 5, bullseyes: 1 }), session({ correct: 5, bullseyes: 2 })];
    const [result] = evaluateMissions([mission({ metric: "bullseyes", target: 3 })], sessions);
    expect(result.current).toBe(3);
    expect(result.completed).toBe(true);
  });

  it("usa la miglior serie combo della sessione", () => {
    const sessions = [session({ bestStreak: 2 }), session({ bestStreak: 4 })];
    const [result] = evaluateMissions([mission({ metric: "streak_combo", target: 4 })], sessions);
    expect(result.current).toBe(4);
    expect(result.completed).toBe(true);
  });

  it("per la sopravvivenza considera la singola run migliore, non la somma", () => {
    const sessions = [
      session({ mode: "survival", rounds: 4 }),
      session({ mode: "survival", rounds: 3 }),
    ];
    const [result] = evaluateMissions(
      [mission({ metric: "survival_best_run", target: 10 })],
      sessions
    );
    expect(result.current).toBe(4);
    expect(result.completed).toBe(false);
  });

  it("conta partite, sprint, precisione e sfida giornaliera", () => {
    const sessions = [
      session({ mode: "sprint" }),
      session({ mode: "sprint" }),
      session({ mode: "precision" }),
      session({ mode: "daily" }),
    ];
    const [games, sprint, precision, daily] = evaluateMissions(
      [
        mission({ id: "g", metric: "games", target: 10 }),
        mission({ id: "s", metric: "sprint", target: 3 }),
        mission({ id: "p", metric: "precision", target: 2 }),
        mission({ id: "d", metric: "daily_challenge", target: 1 }),
      ],
      sessions
    );
    expect(games.current).toBe(4);
    expect(sprint.current).toBe(2);
    expect(precision.current).toBe(1);
    expect(daily.completed).toBe(true);
  });

  it("non supera mai il target e limita il progresso a 1", () => {
    const [result] = evaluateMissions(
      [mission({ metric: "games", target: 2 })],
      [session(), session(), session()]
    );
    expect(result.current).toBe(2);
    expect(result.progress).toBe(1);
  });
});

describe("Missioni: selezione deterministica e onestà della ricompensa", () => {
  it("seleziona le stesse missioni per la stessa data", () => {
    const date = new Date("2026-10-22T08:00:00.000Z");
    expect(getDailyMissions(date)).toEqual(getDailyMissions(date));
    expect(getWeeklyMissions(date)).toEqual(getWeeklyMissions(date));
    expect(dailyMissionSeed(date)).toBe(dailyMissionSeed(date));
    expect(weeklyMissionSeed(date)).toBe(weeklyMissionSeed(date));
  });

  it("restituisce 3 missioni distinte dal pool", () => {
    const daily = getDailyMissions(new Date("2026-10-22T08:00:00.000Z"));
    expect(daily).toHaveLength(3);
    expect(new Set(daily.map((m) => m.id)).size).toBe(3);
    expect(daily.every((m) => DAILY_MISSIONS_POOL.some((def) => def.id === m.id))).toBe(true);

    const weekly = getWeeklyMissions(new Date("2026-10-22T08:00:00.000Z"));
    expect(weekly).toHaveLength(3);
    expect(weekly.every((m) => WEEKLY_MISSIONS_POOL.some((def) => def.id === m.id))).toBe(true);
  });

  it("non promette XP che nessuno accredita", () => {
    for (const def of [...DAILY_MISSIONS_POOL, ...WEEKLY_MISSIONS_POOL]) {
      expect(def).not.toHaveProperty("xp");
      expect(def).not.toHaveProperty("cosmetic");
    }
  });
});
