import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  callRpc,
  callRpcWithRole,
  callTableRpc,
  createTestDb,
  createUser,
  execAsAdmin,
  normalizeRpc,
  queryAs,
  type TestDb,
} from "./harness";

/**
 * Test di integrazione della progressione server (migrazione 005) su
 * PostgreSQL reale (PGlite): XP obiettivo idempotenti, idempotenza delle
 * partite singole, streak, avatar, impostazioni, amici, classifiche.
 */

interface MyProfile {
  username: string;
  email: string;
  avatar_id: string;
  total_score: number;
  games_played: number;
  games_won: number;
  bullseyes: number;
  total_rounds: number;
  total_correct: number;
  best_score: number;
  daily_streak: number;
  xp: number;
  settings: Record<string, unknown>;
  unlocked_achievements: string[];
  duplicate?: boolean;
  newly_unlocked?: string[];
  achievement_xp?: number;
}

let db: TestDb;
let alice: string;
let bob: string;
let carol: string;

async function rpc<T = MyProfile>(
  user: string | null,
  fn: string,
  params: unknown[] = []
): Promise<{ data: T | null; error: string | null }> {
  return normalizeRpc<T>(await callRpc(db, user, fn, params));
}

const SESSION_1 = "11111111-1111-4111-8111-111111111111";
const SESSION_2 = "22222222-2222-4222-8222-222222222222";

async function recordAliceGame(sessionKey: string | null = SESSION_1) {
  return rpc(alice, "record_solo_game", [
    "challenge",
    "easy",
    5000,
    5,
    4,
    120,
    sessionKey,
    1, // bullseyes
    3, // best streak nella partita
    true, // won
  ]);
}

beforeEach(async () => {
  db = await createTestDb();
  alice = await createUser(db, "alice@example.com", "Alice");
  bob = await createUser(db, "bob@example.com", "Bob");
  carol = await createUser(db, "carol@example.com", "Carol");
  await execAsAdmin(db, "UPDATE app_private.rate_limit_policies SET max_hits = 10000");
});

afterEach(async () => {
  await db.close();
});

describe("record_solo_game v2: statistiche complete e idempotenza", () => {
  it("aggiorna tutti gli aggregati e accredita gli XP obiettivo una sola volta", async () => {
    const first = await recordAliceGame();
    expect(first.error).toBeNull();
    const profile = first.data!;
    expect(profile.total_score).toBe(5000);
    expect(profile.games_played).toBe(1);
    expect(profile.games_won).toBe(1);
    expect(profile.bullseyes).toBe(1);
    expect(profile.total_rounds).toBe(5);
    expect(profile.total_correct).toBe(4);
    expect(profile.best_score).toBe(5000);
    expect(profile.daily_streak).toBe(1);
    // 120 XP di partita + 100 (Prima Partita) + 250 (Occhio di Falco)
    expect(profile.achievement_xp).toBe(350);
    expect(profile.xp).toBe(470);
    expect(profile.newly_unlocked).toEqual(expect.arrayContaining(["first_game", "bullseye_1"]));

    // Seconda partita distinta: gli stessi obiettivi NON pagano di nuovo.
    const second = await rpc(alice, "record_solo_game", [
      "challenge",
      "easy",
      1000,
      5,
      2,
      50,
      SESSION_2,
      1,
      1,
      false,
    ]);
    expect(second.error).toBeNull();
    expect(second.data!.xp).toBe(520);
    expect(second.data!.achievement_xp).toBe(0);
    expect(second.data!.games_played).toBe(2);
    expect(second.data!.daily_streak).toBe(1); // stesso giorno UTC

    const rows = await db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM app_private.user_achievements WHERE user_id = $1",
      [alice]
    );
    expect(rows.rows[0].count).toBe("2");
  });

  it("lo stesso session_key (retry di rete) non viene registrato due volte", async () => {
    await recordAliceGame();
    const retry = await recordAliceGame();
    expect(retry.error).toBeNull();
    expect(retry.data!.duplicate).toBe(true);
    expect(retry.data!.games_played).toBe(1);
    expect(retry.data!.xp).toBe(470);

    const sessions = await db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM app_private.profile_sessions WHERE user_id = $1",
      [alice]
    );
    expect(sessions.rows[0].count).toBe("1");
  });

  it("resta compatibile con i vecchi client a 6 argomenti e valida i nuovi campi", async () => {
    const legacy = await rpc(alice, "record_solo_game", ["challenge", "easy", 500, 5, 4, 120]);
    expect(legacy.error).toBeNull();
    expect(legacy.data!.games_played).toBe(1);

    const badBullseyes = await recordAliceGame(null).then(() =>
      rpc(alice, "record_solo_game", ["challenge", "easy", 500, 5, 4, 100, null, 9, 1, false])
    );
    expect(badBullseyes.error).toContain("MG400:invalid_bullseyes");

    const badStreak = await rpc(alice, "record_solo_game", [
      "challenge",
      "easy",
      500,
      5,
      4,
      100,
      null,
      0,
      99,
      false,
    ]);
    expect(badStreak.error).toContain("MG400:invalid_best_streak");
  });

  it("richiede autenticazione reale per le RPC sensibili", async () => {
    const anon = await callRpcWithRole(db, "anon", null, "record_solo_game", [
      "challenge",
      "easy",
      10,
      1,
      1,
      10,
    ]);
    expect(anon.error).toContain("permission denied");

    const noSubject = normalizeRpc(
      await callRpcWithRole(db, "authenticated", null, "get_my_progression")
    );
    expect(noSubject.error).toContain("MG401:authentication_required");

    const anonAvatar = await callRpcWithRole(db, "anon", null, "set_avatar", ["fox"]);
    expect(anonAvatar.error).toContain("permission denied");
  });

  it("la streak cresce il giorno dopo e si azzera dopo un salto", async () => {
    await recordAliceGame();
    // Simula "ieri" con streak 3: la partita di oggi deve portarla a 4.
    await execAsAdmin(
      db,
      `UPDATE app_private.profile_private
       SET last_played_on = (clock_timestamp() AT TIME ZONE 'UTC')::date - 1, daily_streak = 3
       WHERE user_id = $1`,
      [alice]
    );
    const nextDay = await recordAliceGame(SESSION_2);
    expect(nextDay.data!.daily_streak).toBe(4);

    await execAsAdmin(
      db,
      `UPDATE app_private.profile_private
       SET last_played_on = (clock_timestamp() AT TIME ZONE 'UTC')::date - 5
       WHERE user_id = $1`,
      [alice]
    );
    const afterGap = await rpc(alice, "record_solo_game", ["timed", "medium", 100, 2, 1, 30]);
    expect(afterGap.data!.daily_streak).toBe(1);
  });
});

describe("Avatar cosmetici e impostazioni", () => {
  it("valida catalogo e livello di sblocco degli avatar", async () => {
    const invalid = await rpc(alice, "set_avatar", ["non_esiste"]);
    expect(invalid.error).toContain("MG400:invalid_avatar");

    const locked = await rpc(alice, "set_avatar", ["dragon"]);
    expect(locked.error).toContain("MG403:avatar_locked");

    const ok = await rpc(alice, "set_avatar", ["compass"]);
    expect(ok.error).toBeNull();
    expect(ok.data!.avatar_id).toBe("compass");

    const direct = await queryAs(db, alice, "UPDATE public.profiles SET avatar_id = 'dragon'");
    expect(direct.error).toContain("permission denied");
  });

  it("accetta solo impostazioni note e booleane", async () => {
    const ok = await rpc(alice, "set_my_settings", [JSON.stringify({ reduce_motion: true })]);
    expect(ok.error).toBeNull();
    expect(ok.data!.settings).toMatchObject({ reduce_motion: true });

    const badKey = await rpc(alice, "set_my_settings", [JSON.stringify({ tema: "rosa" })]);
    expect(badKey.error).toContain("MG400:invalid_settings");

    const badType = await rpc(alice, "set_my_settings", [JSON.stringify({ reduce_motion: "sì" })]);
    expect(badType.error).toContain("MG400:invalid_settings");
  });
});

describe("Progressione e storico personali", () => {
  it("restituisce solo i dati del chiamante, con modalità e storico multiplayer", async () => {
    await recordAliceGame();
    // Una riga multiplayer come la scriverebbe record_multiplayer_results.
    await execAsAdmin(
      db,
      `INSERT INTO app_private.profile_sessions
         (user_id, mode, difficulty, score, rounds, correct_answers, xp_earned, won)
       VALUES ($1, 'multiplayer_capital', 'easy', 450, 5, 4, 95, true)`,
      [alice]
    );

    interface Progression {
      profile: MyProfile;
      achievements: { id: string }[];
      mode_stats: { mode: string; games: number }[];
      recent_sessions: { mode: string }[];
    }
    const progression = await rpc<Progression>(alice, "get_my_progression");
    expect(progression.error).toBeNull();
    expect(progression.data!.profile.email).toBe("alice@example.com");
    expect(progression.data!.achievements.map((a) => a.id)).toContain("first_game");
    expect(progression.data!.mode_stats.map((m) => m.mode)).toEqual(
      expect.arrayContaining(["challenge", "multiplayer_capital"])
    );

    const bobProgression = await rpc<Progression>(bob, "get_my_progression");
    expect(bobProgression.data!.profile.games_played).toBe(0);
    expect(JSON.stringify(bobProgression.data)).not.toContain("alice@example.com");

    const allHistory = await callTableRpc<{ mode: string; is_multiplayer: boolean }>(
      db,
      alice,
      "get_my_history",
      [20, false]
    );
    expect(allHistory.rows).toHaveLength(2);
    const mpHistory = await callTableRpc<{ mode: string; is_multiplayer: boolean }>(
      db,
      alice,
      "get_my_history",
      [20, true]
    );
    expect(mpHistory.rows).toHaveLength(1);
    expect(mpHistory.rows[0].mode).toBe("multiplayer_capital");
    expect(mpHistory.rows[0].is_multiplayer).toBe(true);
  });
});

describe("Amici e classifiche", () => {
  it("gestisce amicizie per nickname pubblico e classifica ristretta", async () => {
    const missing = await rpc(alice, "add_friend", ["GiocatoreInesistente"]);
    expect(missing.error).toContain("MG404:friend_not_found");

    const self = await rpc(alice, "add_friend", ["Alice"]);
    expect(self.error).toContain("MG400:cannot_friend_self");

    const added = await rpc<{
      ok: boolean;
      already_friends: boolean;
      friend: { username: string };
    }>(
      alice,
      "add_friend",
      ["bob"] // case-insensitive
    );
    expect(added.error).toBeNull();
    expect(added.data!.friend.username).toBe("Bob");
    expect(added.data!.already_friends).toBe(false);

    const again = await rpc<{ already_friends: boolean }>(alice, "add_friend", ["Bob"]);
    expect(again.data!.already_friends).toBe(true);

    const list = await callTableRpc<{ username: string }>(db, alice, "list_friends");
    expect(list.rows.map((r) => r.username)).toEqual(["Bob"]);

    await recordAliceGame();
    await rpc(bob, "record_solo_game", ["challenge", "easy", 9000, 5, 5, 200]);
    await rpc(carol, "record_solo_game", ["challenge", "easy", 9999, 5, 5, 200]);

    const friendsBoard = await callTableRpc<{ username: string; avatar_id: string }>(
      db,
      alice,
      "get_friends_leaderboard",
      ["all"]
    );
    expect(friendsBoard.rows.map((r) => r.username)).toEqual(["Bob", "Alice"]);
    expect(JSON.stringify(friendsBoard.rows)).not.toContain("@example.com");
    expect(friendsBoard.rows[0].avatar_id).toBeTruthy();

    const removed = await rpc<{ removed: boolean }>(alice, "remove_friend", [bob]);
    expect(removed.data!.removed).toBe(true);
    const afterRemove = await callTableRpc<{ username: string }>(
      db,
      alice,
      "get_friends_leaderboard",
      ["all"]
    );
    expect(afterRemove.rows.map((r) => r.username)).toEqual(["Alice"]);
  });

  it("classifica globale: nessun utente senza partite, spareggio per efficienza", async () => {
    // Stato controllato a mano (admin): due giocatori a 5000 punti,
    // uno con 1 partita e uno con 4; Carol senza partite è esclusa.
    await execAsAdmin(
      db,
      `INSERT INTO app_private.profile_private (user_id, total_score, games_played)
       VALUES ($1, 5000, 4), ($2, 5000, 1)
       ON CONFLICT (user_id) DO UPDATE SET total_score = EXCLUDED.total_score, games_played = EXCLUDED.games_played`,
      [alice, bob]
    );
    const board = await callTableRpc<{ username: string; total_score: number; avatar_id: string }>(
      db,
      null,
      "get_leaderboard",
      ["all"]
    );
    expect(board.error).toBeNull();
    expect(board.rows.map((r) => r.username)).toEqual(["Bob", "Alice"]);
    expect(board.rows[0].avatar_id).toBe("globe");
    expect(JSON.stringify(board.rows)).not.toContain("@example.com");
  });
});
