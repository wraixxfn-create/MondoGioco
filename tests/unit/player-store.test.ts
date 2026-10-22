import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMultiplayerRoom } from "@/lib/services/multiplayer";
import {
  computeXpGain,
  describeAuthError,
  fetchFriends,
  fetchLeaderboard,
  fetchMyHistory,
  loadLocalPlayer,
  loadLocalSessions,
  progressionStatsOf,
  recordGameResult,
  renamePlayer,
  requestPasswordReset,
  setAvatar,
  signInWithEmail,
  signUpWithEmail,
  updateSettings,
} from "@/lib/services/player-store";

// Simula assenza di rete nei test unitari per verificare persistenza e fallback istantanei
vi.stubGlobal(
  "fetch",
  vi.fn(() => Promise.reject(new Error("offline test environment")))
);

describe("Player Store & Leaderboard", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("crea e mantiene un profilo giocatore persistente", () => {
    const first = loadLocalPlayer();
    const second = loadLocalPlayer();
    expect(first.playerId).toBe(second.playerId);
    expect(first.username).toMatch(/^Esploratore_/);
    expect(first.gamesPlayed).toBe(0);
  });

  it("calcola correttamente gli XP guadagnati", () => {
    expect(
      computeXpGain({
        mode: "challenge",
        score: 0,
        roundsPlayed: 0,
        goodRounds: 0,
        bestStreak: 0,
      })
    ).toBe(0);

    const xp = computeXpGain({
      mode: "challenge",
      score: 12000,
      roundsPlayed: 5,
      goodRounds: 4,
      bestStreak: 3,
      bullseyes: 2,
      won: true,
    });
    expect(xp).toBeGreaterThan(1000);
  });

  it("registra una partita completata e aggiorna classifica e sessioni", async () => {
    const res = await recordGameResult({
      mode: "challenge",
      difficulty: "medium",
      score: 50000,
      roundsPlayed: 10,
      goodRounds: 9,
      bestStreak: 6,
      bullseyes: 3,
      won: true,
    });

    expect(res.xpEarned).toBeGreaterThan(0);
    expect(res.player.gamesPlayed).toBe(1);
    expect(res.player.totalScore).toBe(50000);
    expect(res.player.gamesWon).toBe(1);
    expect(res.player.bullseyes).toBe(3);
    expect(loadLocalSessions()).toHaveLength(1);

    const lb = await fetchLeaderboard("all");
    expect(lb.entries[0].isCurrentPlayer).toBe(true);
    expect(lb.entries[0].totalScore).toBe(50000);
  });

  it("valida e aggiorna il nickname del giocatore", async () => {
    const invalid = await renamePlayer("a");
    expect(invalid.ok).toBe(false);

    const valid = await renamePlayer("CapitanoNemo");
    expect(valid.ok).toBe(true);
    expect(valid.player.username).toBe("CapitanoNemo");
    expect(loadLocalPlayer().username).toBe("CapitanoNemo");
  });

  it("la stessa partita registrata due volte non accredita XP doppi (idempotenza locale)", async () => {
    const input = {
      mode: "challenge",
      score: 4000,
      roundsPlayed: 5,
      goodRounds: 4,
      bestStreak: 3,
      sessionId: "3b0d0b62-48d2-4bb5-9fb4-000000000001",
    };
    const first = await recordGameResult(input);
    const second = await recordGameResult(input);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.xpEarned).toBe(0);
    expect(second.player.gamesPlayed).toBe(1);
    expect(second.player.xp).toBe(first.player.xp);
    expect(loadLocalSessions()).toHaveLength(1);
  });

  it("sblocca gli obiettivi una sola volta e aggiorna accuratezza, record e streak", async () => {
    const first = await recordGameResult({
      mode: "challenge",
      score: 24000,
      roundsPlayed: 5,
      goodRounds: 5,
      bestStreak: 5,
      bullseyes: 2,
      won: true,
      endedAt: "2026-01-10T12:00:00.000Z",
    });
    const firstIds = first.newlyUnlocked.map((a) => a.id);
    expect(firstIds).toEqual(
      expect.arrayContaining(["first_game", "bullseye_1", "streak_5", "best_score_20000"])
    );
    expect(first.achievementXp).toBeGreaterThan(0);
    expect(first.xpEarned).toBe(first.gameXp + first.achievementXp);
    expect(first.player.dailyStreak).toBe(1);

    const second = await recordGameResult({
      mode: "challenge",
      score: 1000,
      roundsPlayed: 5,
      goodRounds: 1,
      bestStreak: 1,
      endedAt: "2026-01-11T12:00:00.000Z",
    });
    // Gli obiettivi già sbloccati non pagano di nuovo.
    expect(second.newlyUnlocked.map((a) => a.id)).not.toContain("first_game");
    expect(second.player.dailyStreak).toBe(2);
    expect(second.player.longestDailyStreak).toBe(2);
    expect(second.player.bestScore).toBe(24000);

    const stats = progressionStatsOf(second.player);
    expect(stats.totalRounds).toBe(10);
    expect(stats.totalCorrect).toBe(6);

    const history = await fetchMyHistory(10);
    expect(history.source).toBe("local");
    expect(history.entries).toHaveLength(2);
    expect(history.entries[0].score).toBe(1000);
  });

  it("la classifica locale non contiene giocatori inventati", async () => {
    const empty = await fetchLeaderboard("all");
    expect(empty.source).toBe("local");
    expect(empty.entries).toEqual([]);

    await recordGameResult({
      mode: "challenge",
      score: 3000,
      roundsPlayed: 5,
      goodRounds: 3,
      bestStreak: 2,
      endedAt: "2020-01-01T12:00:00.000Z",
    });
    const all = await fetchLeaderboard("all");
    expect(all.entries).toHaveLength(1);
    expect(all.entries[0].isCurrentPlayer).toBe(true);
    expect(all.entries[0].username).not.toMatch(/GeoMaster|Marco Polo/);
    // Partita vecchia di anni: fuori dalla finestra settimanale.
    const week = await fetchLeaderboard("week");
    expect(week.entries).toEqual([]);
  });

  it("stati espliciti senza account cloud: amici e auth non fingono nulla", async () => {
    const friendsBoard = await fetchLeaderboard("all", "friends");
    expect(friendsBoard.source).toBe("unavailable");
    expect(friendsBoard.notice).toBeTruthy();
    expect(friendsBoard.entries).toEqual([]);

    const friends = await fetchFriends();
    expect(friends.friends).toEqual([]);
    expect(friends.error).toMatch(/non è configurato/);

    const login = await signInWithEmail("test@example.com", "segreta1");
    expect(login.ok).toBe(false);
    expect(login.error).toMatch(/non è configurato/);
    const signup = await signUpWithEmail("test@example.com", "segreta1", "Tester");
    expect(signup.ok).toBe(false);
    expect(signup.error).toMatch(/non è configurato/);

    const reset = await requestPasswordReset("test@example.com");
    expect(reset.ok).toBe(false);
    expect(reset.error).toMatch(/non è configurato/);
    const badEmail = await requestPasswordReset("non-un-email");
    expect(badEmail.ok).toBe(false);
    expect(badEmail.error).toMatch(/valido/);
  });

  it("traduce gli errori di autenticazione in messaggi comprensibili", () => {
    expect(describeAuthError("Invalid login credentials")).toMatch(/non corrette/);
    expect(describeAuthError("User already registered")).toMatch(/già un account/);
    expect(describeAuthError("Email not confirmed")).toMatch(/non ancora confermata/);
    expect(describeAuthError("MG409:username_taken")).toMatch(/già in uso/);
    expect(describeAuthError("Failed to fetch")).toMatch(/offline|Connessione/);
  });

  it("avatar: blocca quelli non ancora sbloccati, salva quelli disponibili", async () => {
    const locked = await setAvatar("dragon");
    expect(locked.ok).toBe(false);
    expect(locked.error).toMatch(/livello 10/);

    const ok = await setAvatar("compass");
    expect(ok.ok).toBe(true);
    expect(loadLocalPlayer().avatarId).toBe("compass");

    const invalid = await setAvatar("non_esiste");
    expect(invalid.ok).toBe(false);
  });

  it("impostazioni: persistono in locale e applicano subito la riduzione animazioni", async () => {
    const res = await updateSettings({ reduceMotion: true, globeAutoRotate: false });
    expect(res.ok).toBe(true);
    expect(loadLocalPlayer().settings).toEqual({ reduceMotion: true, globeAutoRotate: false });
    expect(document.documentElement.dataset.reduceMotion).toBe("true");
    await updateSettings({ reduceMotion: false });
    expect(document.documentElement.dataset.reduceMotion).toBe("false");
  });

  it("non finge il multiplayer quando Supabase non è configurato", async () => {
    const result = await createMultiplayerRoom({
      name: "Sfida Italiana",
      quizType: "capital",
      difficulty: "easy",
      totalRounds: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_CONFIGURED");
  });
});
