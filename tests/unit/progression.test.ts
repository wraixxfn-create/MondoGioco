import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  XP_RULES,
  achievementProgress,
  assignRanks,
  compareLeaderboardEntries,
  computeGameXp,
  deriveStats,
  EMPTY_PROGRESSION_STATS,
  evaluateAchievements,
  formatAccuracy,
  getAvatar,
  isAvatarUnlocked,
  levelTitle,
  localDateKey,
  modeLabel,
  nextDailyStreak,
  normalizeUserSettings,
  userSettingsToDb,
} from "@/lib/game/progression";

describe("Regole XP di partita (documentate)", () => {
  it("nessun round → nessun XP", () => {
    expect(computeGameXp({ score: 9999, roundsPlayed: 0 })).toBe(0);
  });

  it("applica la formula: punti/12 + 40·bullseye + 15·round + bonus vittoria", () => {
    const xp = computeGameXp({ score: 1200, roundsPlayed: 5, bullseyes: 2, won: true });
    expect(xp).toBe(100 + 80 + 75 + XP_RULES.winBonus);
  });

  it("garantisce il minimo per partita giocata", () => {
    expect(computeGameXp({ score: 0, roundsPlayed: 1 })).toBe(XP_RULES.minimumPerGame);
  });
});

describe("Obiettivi", () => {
  it("ha id univoci e stabili con soglie positive", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.id).toMatch(/^[a-z0-9_]+$/);
      expect(a.threshold).toBeGreaterThan(0);
      expect(a.xp).toBeGreaterThan(0);
    }
  });

  it("sblocca solo gli obiettivi raggiunti e mai due volte lo stesso", () => {
    const stats = { ...EMPTY_PROGRESSION_STATS, gamesPlayed: 1, bullseyes: 1, totalScore: 100 };
    const first = evaluateAchievements(stats, []);
    expect(first.newlyUnlocked.map((a) => a.id)).toEqual(
      expect.arrayContaining(["first_game", "bullseye_1"])
    );
    expect(first.xpAwarded).toBe(100 + 250);

    const again = evaluateAchievements(
      stats,
      first.newlyUnlocked.map((a) => a.id)
    );
    expect(again.newlyUnlocked).toHaveLength(0);
    expect(again.xpAwarded).toBe(0);
  });

  it("calcola l'avanzamento parziale per la UI", () => {
    const explorer = ACHIEVEMENTS.find((a) => a.id === "explorer_10")!;
    const stats = { ...EMPTY_PROGRESSION_STATS, gamesPlayed: 5 };
    expect(achievementProgress(explorer, stats)).toBe(0.5);
    expect(achievementProgress(explorer, { ...stats, gamesPlayed: 99 })).toBe(1);
  });
});

describe("Streak giornaliera", () => {
  it("prima partita → streak 1; stesso giorno → invariata", () => {
    expect(nextDailyStreak(null, 0, "2026-01-10")).toBe(1);
    expect(nextDailyStreak("2026-01-10", 3, "2026-01-10")).toBe(3);
  });

  it("giorno consecutivo → +1, anche a cavallo del mese", () => {
    expect(nextDailyStreak("2026-01-10", 3, "2026-01-11")).toBe(4);
    expect(nextDailyStreak("2026-01-31", 6, "2026-02-01")).toBe(7);
  });

  it("salto di uno o più giorni → ricomincia da 1", () => {
    expect(nextDailyStreak("2026-01-10", 9, "2026-01-12")).toBe(1);
    expect(nextDailyStreak("2026-01-10", 9, "2026-03-01")).toBe(1);
  });

  it("localDateKey formatta YYYY-MM-DD", () => {
    expect(localDateKey(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });
});

describe("Avatar e titoli cosmetici", () => {
  it("gli avatar base sono disponibili da subito, gli altri col livello", () => {
    expect(isAvatarUnlocked("globe", 1)).toBe(true);
    expect(isAvatarUnlocked("dragon", 3)).toBe(false);
    expect(isAvatarUnlocked("dragon", 10)).toBe(true);
    expect(isAvatarUnlocked("avatar_inesistente", 99)).toBe(false);
    expect(getAvatar("inesistente").id).toBe("globe");
  });

  it("i titoli crescono col livello e non danno vantaggi", () => {
    expect(levelTitle(1)).toContain("Apprendista");
    expect(levelTitle(7)).toBe("Cartografo");
    expect(levelTitle(99)).toContain("Leggenda");
  });
});

describe("Impostazioni utente", () => {
  it("normalizza valori mancanti, camelCase e snake_case del DB", () => {
    expect(normalizeUserSettings(null)).toEqual({ reduceMotion: false, globeAutoRotate: true });
    expect(normalizeUserSettings({ reduce_motion: true })).toEqual({
      reduceMotion: true,
      globeAutoRotate: true,
    });
    expect(normalizeUserSettings({ reduceMotion: "sì", globeAutoRotate: false })).toEqual({
      reduceMotion: false,
      globeAutoRotate: false,
    });
    expect(userSettingsToDb({ reduceMotion: true, globeAutoRotate: false })).toEqual({
      reduce_motion: true,
      globe_auto_rotate: false,
    });
  });
});

describe("Statistiche derivate dallo storico", () => {
  it("senza partite accuratezza e media sono null (dato mancante, non 0)", () => {
    const derived = deriveStats([]);
    expect(derived.accuracy).toBeNull();
    expect(derived.averageScore).toBeNull();
    expect(formatAccuracy(null)).toBe("—");
  });

  it("calcola accuratezza, media, record e statistiche per modalità", () => {
    const derived = deriveStats([
      { mode: "challenge", score: 10000, rounds: 5, correct: 4, endedAt: "2026-01-01", won: true },
      { mode: "challenge", score: 5000, rounds: 5, correct: 2, endedAt: "2026-01-02" },
      {
        mode: "multiplayer_capital",
        score: 300,
        rounds: 5,
        correct: 3,
        endedAt: "2026-01-03",
        won: true,
      },
    ]);
    expect(derived.accuracy).toBeCloseTo(9 / 15);
    expect(derived.averageScore).toBe(5100);
    expect(derived.bestScore).toBe(10000);
    expect(derived.multiplayerGames).toBe(1);
    expect(derived.multiplayerWins).toBe(1);
    const challenge = derived.byMode.find((m) => m.mode === "challenge");
    expect(challenge).toMatchObject({ games: 2, wins: 1, bestScore: 10000 });
    expect(challenge?.accuracy).toBeCloseTo(0.6);
    expect(modeLabel("multiplayer_capital")).toBe("Multiplayer · Capitali");
    expect(modeLabel("timed")).toBe("Contro il tempo");
  });
});

describe("Classifiche: pareggi e ordinamento", () => {
  it("a pari punti condivide la posizione (1, 2, 2, 4)", () => {
    const ranked = assignRanks([
      { username: "a", totalScore: 100 },
      { username: "b", totalScore: 50 },
      { username: "c", totalScore: 50 },
      { username: "d", totalScore: 10 },
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it("a pari punti ordina davanti chi ha giocato meno, poi per nome", () => {
    const entries = [
      { username: "Zoe", totalScore: 100, gamesPlayed: 5 },
      { username: "anna", totalScore: 100, gamesPlayed: 2 },
      { username: "Marco Polo", totalScore: 100, gamesPlayed: 2 },
      { username: "Primo", totalScore: 200, gamesPlayed: 9 },
    ].sort(compareLeaderboardEntries);
    expect(entries.map((e) => e.username)).toEqual(["Primo", "anna", "Marco Polo", "Zoe"]);
  });
});
