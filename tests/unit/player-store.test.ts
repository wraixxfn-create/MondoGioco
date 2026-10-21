import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMultiplayerRoom } from "@/lib/services/multiplayer";
import {
  computeXpGain,
  fetchLeaderboard,
  loadLocalPlayer,
  loadLocalSessions,
  recordGameResult,
  renamePlayer,
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
