import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ageMemberPresence,
  callRpc,
  createTestDb,
  createUser,
  execAsAdmin,
  getRoundAnswer,
  normalizeRpc,
  queryAs,
  shiftRoomClock,
  type TestDb,
} from "./harness";

/**
 * Regressioni emerse dall'audit di release.
 *
 * Ogni test descrive un comportamento competitivo o di integrità che il
 * server deve garantire e che in precedenza era errato. Girano su
 * PostgreSQL (PGlite) applicando le migrazioni reali del repository.
 */

interface Snapshot {
  server_time: string;
  room: {
    id: string;
    code: string;
    host_id: string;
    phase: string;
    current_round: number;
    total_rounds: number;
    closed_reason: string | null;
  };
  me: {
    user_id: string;
    score: number;
    connection: string;
    answered_current_round: boolean;
    is_host: boolean;
  } | null;
  players: { user_id: string; connection: string; score: number; is_ready: boolean }[];
  standings: { user_id: string; score: number; correct_count: number }[];
  round: { index: number; options: string[]; answered_count: number } | null;
  reveal: {
    round_index: number;
    correct_answer: string;
    results: { user_id: string; answer: string; is_correct: boolean; points: number }[];
  } | null;
}

let db: TestDb;
let alice: string;
let bob: string;
let carol: string;
let dave: string;

async function rpc<T = Snapshot>(
  user: string | null,
  fn: string,
  params: unknown[] = []
): Promise<{ data: T | null; error: string | null }> {
  return normalizeRpc<T>(await callRpc(db, user, fn, params));
}

async function newRoom(
  host: string = alice,
  params: unknown[] = ["Audit Room", "capital", "easy", 3, 4, 20]
): Promise<Snapshot> {
  const res = await rpc<Snapshot>(host, "create_room", params);
  expect(res.error).toBeNull();
  return res.data as Snapshot;
}

async function joinedRoom(host = alice, guest = bob): Promise<Snapshot> {
  const room = await newRoom(host);
  const joined = await rpc<Snapshot>(guest, "join_room", [room.room.code]);
  expect(joined.error).toBeNull();
  return joined.data as Snapshot;
}

async function readyAndStart(room: Snapshot, host = alice, guest = bob): Promise<Snapshot> {
  expect((await rpc(guest, "set_ready", [room.room.id, true])).error).toBeNull();
  const started = await rpc<Snapshot>(host, "start_game", [room.room.id]);
  expect(started.error).toBeNull();
  return started.data as Snapshot;
}

beforeEach(async () => {
  db = await createTestDb();
  alice = await createUser(db, "alice@example.com", "Alice");
  bob = await createUser(db, "bob@example.com", "Bob");
  carol = await createUser(db, "carol@example.com", "Carol");
  dave = await createUser(db, "dave@example.com", "Dave");
  await execAsAdmin(db, "UPDATE app_private.rate_limit_policies SET max_hits = 10000");
});

afterEach(async () => {
  await db.close();
});

describe("Integrità dei punteggi singoli", () => {
  it("accetta una partita perfetta con combo (27.500 punti su 5 round)", async () => {
    // Punteggio massimo reale: 5 round perfetti con combo ×1.00, ×1.05,
    // ×1.10, ×1.15 e ×1.20 = 27.500. È legittimo secondo il motore di gioco
    // (lib/game/engine.ts) e non deve essere rifiutato come "non plausibile".
    const res = await rpc(alice, "record_solo_game", [
      "sprint",
      "medium",
      27500,
      5,
      5,
      3392,
      "3b0d0b62-48d2-4bb5-9fb4-000000000101",
      5,
      5,
      true,
    ]);
    expect(res.error).toBeNull();

    const profile = await db.query<{ total_score: number; games_played: number }>(
      "SELECT total_score, games_played FROM app_private.profile_private WHERE user_id = $1",
      [alice]
    );
    expect(profile.rows[0].total_score).toBe(27500);
    expect(profile.rows[0].games_played).toBe(1);

    const session = await db.query<{ score: number }>(
      "SELECT score FROM app_private.profile_sessions WHERE user_id = $1",
      [alice]
    );
    expect(session.rows[0].score).toBe(27500);
  });

  it("ricalcola gli XP sul server e ignora il valore dichiarato dal client", async () => {
    // Formula condivisa con lib/game/progression.ts:
    // round(5000/12) + 40×1 bullseye + 15×5 round + 75 vittoria = 607.
    const res = await rpc<{ game_xp: number; xp: number }>(alice, "record_solo_game", [
      "sprint",
      "medium",
      5000,
      5,
      4,
      3700,
      "3b0d0b62-48d2-4bb5-9fb4-000000000102",
      1,
      3,
      true,
    ]);
    expect(res.error).toBeNull();
    expect(res.data?.game_xp).toBe(607);

    const stored = await db.query<{ xp_earned: number }>(
      "SELECT xp_earned FROM app_private.profile_sessions WHERE user_id = $1",
      [alice]
    );
    expect(stored.rows[0].xp_earned).toBe(607);

    // Il client non può gonfiare gli XP: il valore usato è quello calcolato.
    const inflated = await rpc(alice, "record_solo_game", [
      "sprint",
      "medium",
      500,
      5,
      4,
      3600,
      "3b0d0b62-48d2-4bb5-9fb4-000000000103",
      0,
      0,
      false,
    ]);
    expect(inflated.error).toBeNull();
    const rows = await db.query<{ xp_earned: number }>(
      "SELECT xp_earned FROM app_private.profile_sessions WHERE user_id = $1 ORDER BY xp_earned DESC",
      [alice]
    );
    // round(500/12) + 15×5 = 117, non 3600.
    expect(rows.rows.map((row) => row.xp_earned)).toContain(117);
  });

  it("accetta una sessione lunga (oltre 50 round, modalità a tempo/allenamento)", async () => {
    const res = await rpc(alice, "record_solo_game", [
      "timed",
      "medium",
      60000,
      60,
      60,
      0,
      "3b0d0b62-48d2-4bb5-9fb4-000000000104",
      60,
      60,
      false,
    ]);
    expect(res.error).toBeNull();
    const stored = await db.query<{ rounds: number }>(
      "SELECT rounds FROM app_private.profile_sessions WHERE user_id = $1",
      [alice]
    );
    expect(stored.rows[0].rounds).toBe(60);
  });

  it("rifiuta bullseye/serie superiori alle risposte corrette", async () => {
    const bullseyes = await rpc(alice, "record_solo_game", [
      "sprint",
      "medium",
      1000,
      5,
      1,
      0,
      null,
      2,
      0,
      false,
    ]);
    expect(bullseyes.error).toContain("MG400:invalid_bullseyes");

    const streak = await rpc(alice, "record_solo_game", [
      "sprint",
      "medium",
      1000,
      5,
      1,
      0,
      null,
      0,
      4,
      false,
    ]);
    expect(streak.error).toContain("MG400:invalid_best_streak");
  });

  it("rifiuta comunque punteggi oltre il massimo teorico del motore", async () => {
    const res = await rpc(alice, "record_solo_game", [
      "sprint",
      "medium",
      31251,
      5,
      5,
      5000,
      null,
      5,
      5,
      true,
    ]);
    expect(res.error).toContain("MG400:invalid_score");
  });
});

describe("Avvio partita e banca domande", () => {
  it("non lascia la stanza bloccata se la banca domande è insufficiente", async () => {
    // Restano solo 2 domande ma la stanza ne richiede 3: il caso pericoloso
    // è l'inserimento parziale dei round prima di scoprire l'errore.
    await execAsAdmin(
      db,
      `DELETE FROM app_private.question_bank
       WHERE quiz_type = 'capital'
         AND id NOT IN (
           SELECT id FROM app_private.question_bank
           WHERE quiz_type = 'capital'
           ORDER BY id
           LIMIT 2
         )`
    );

    const room = await joinedRoom();
    expect((await rpc(bob, "set_ready", [room.room.id, true])).error).toBeNull();

    const failed = await rpc(alice, "start_game", [room.room.id]);
    expect(failed.error).toContain("MG500:round_generation_failed");

    // Nessun round parziale scritto: la stanza resta in lobby e può riprovare
    // (dopo aver ripopolato la banca) senza incappare in "game_already_started".
    const rounds = await db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM public.game_rounds WHERE room_id = $1",
      [room.room.id]
    );
    expect(rounds.rows[0].count).toBe("0");

    const retry = await rpc(alice, "start_game", [room.room.id]);
    expect(retry.error).not.toContain("MG409:game_already_started");
    expect(retry.error).toContain("MG500:round_generation_failed");

    const phase = await db.query<{ phase: string }>(
      "SELECT phase FROM public.game_rooms WHERE id = $1",
      [room.room.id]
    );
    expect(phase.rows[0].phase).toBe("lobby");
  });
});

describe("Riservatezza dei punteggi durante il round", () => {
  it("non espone i punteggi live tramite SELECT diretta dei membri", async () => {
    const room = await readyAndStart(await joinedRoom());
    const correct = await getRoundAnswer(db, room.room.id, 1);
    expect((await rpc(alice, "submit_answer", [room.room.id, 1, correct])).error).toBeNull();

    // Lo snapshot continua a nascondere il punteggio parziale...
    const snap = (await rpc<Snapshot>(bob, "sync_room", [room.room.id])).data as Snapshot;
    expect(snap.room.phase).toBe("round_active");
    expect(snap.players.find((p) => p.user_id === alice)?.score).toBe(0);

    // ...e anche l'accesso diretto alla tabella deve essere precluso o non
    // contenere punteggi aggiornati durante il round.
    const direct = await queryAs<{ score: number }>(
      db,
      bob,
      "SELECT score FROM public.game_room_members WHERE room_id = $1 AND user_id = $2",
      [room.room.id, alice]
    );
    const leaked = direct.error === null && (direct.rows[0]?.score ?? 0) > 0;
    expect(leaked).toBe(false);
  });
});

describe("Presenza e risposte", () => {
  it("accetta la risposta di un giocatore marcato disconnesso da un heartbeat", async () => {
    const room = await readyAndStart(await joinedRoom());
    // Entrambi i client restano silenziosi oltre la grazia: il heartbeat di
    // uno marca l'altro come "disconnected" anche se sta per rispondere.
    await ageMemberPresence(db, room.room.id, 120);
    const aliceView = (await rpc<Snapshot>(alice, "heartbeat", [room.room.id])).data as Snapshot;
    expect(aliceView.players.find((p) => p.user_id === bob)?.connection).toBe("disconnected");

    const correct = await getRoundAnswer(db, room.room.id, 1);
    const answer = await rpc<Snapshot>(bob, "submit_answer", [room.room.id, 1, correct]);
    expect(answer.error).toBeNull();
    expect(answer.data?.players.find((p) => p.user_id === bob)?.connection).toBe("connected");
  });

  it("un heartbeat ravvicinato non riscrive presence e stanza a ogni chiamata", async () => {
    const room = await readyAndStart(await joinedRoom());
    const first = await db.query<{ last_seen_at: Date | string; activity: Date | string }>(
      `SELECT m.last_seen_at, r.last_activity_at AS activity
       FROM public.game_room_members m
       JOIN public.game_rooms r ON r.id = m.room_id
       WHERE m.room_id = $1 AND m.user_id = $2`,
      [room.room.id, alice]
    );

    await rpc(alice, "heartbeat", [room.room.id]);
    await rpc(alice, "heartbeat", [room.room.id]);

    const second = await db.query<{ last_seen_at: Date | string; activity: Date | string }>(
      `SELECT m.last_seen_at, r.last_activity_at AS activity
       FROM public.game_room_members m
       JOIN public.game_rooms r ON r.id = m.room_id
       WHERE m.room_id = $1 AND m.user_id = $2`,
      [room.room.id, alice]
    );

    expect(new Date(second.rows[0].last_seen_at).getTime()).toBe(
      new Date(first.rows[0].last_seen_at).getTime()
    );
    expect(new Date(second.rows[0].activity).getTime()).toBe(
      new Date(first.rows[0].activity).getTime()
    );

    // Dopo un silenzio prolungato la presenza torna a essere aggiornata.
    await ageMemberPresence(db, room.room.id, 60);
    await rpc(alice, "heartbeat", [room.room.id]);
    const third = await db.query<{ last_seen_at: Date | string }>(
      "SELECT last_seen_at FROM public.game_room_members WHERE room_id = $1 AND user_id = $2",
      [room.room.id, alice]
    );
    expect(new Date(third.rows[0].last_seen_at).getTime()).toBeGreaterThan(
      new Date(second.rows[0].last_seen_at).getTime()
    );
  });
});

describe("Partita completa con due giocatori", () => {
  it("gioca 3 round, rivela le soluzioni, chiude e registra le statistiche una volta", async () => {
    const room = await readyAndStart(await joinedRoom());
    expect(room.room.phase).toBe("round_active");

    for (let roundIndex = 1; roundIndex <= 3; roundIndex += 1) {
      const current = (await rpc<Snapshot>(alice, "sync_room", [room.room.id])).data as Snapshot;
      expect(current.room.phase).toBe("round_active");
      expect(current.room.current_round).toBe(roundIndex);
      expect(current.reveal).toBeNull();

      const correct = await getRoundAnswer(db, room.room.id, roundIndex);
      const wrong = current.round!.options.find((option) => option !== correct);
      expect(wrong).toBeTruthy();

      expect(
        (await rpc(alice, "submit_answer", [room.room.id, roundIndex, correct])).error
      ).toBeNull();
      const second = await rpc<Snapshot>(bob, "submit_answer", [room.room.id, roundIndex, wrong!]);
      expect(second.error).toBeNull();
      expect(second.data?.room.phase).toBe("round_reveal");
      expect(second.data?.reveal?.correct_answer).toBe(correct);
      expect(second.data?.reveal?.results).toHaveLength(2);

      await shiftRoomClock(db, room.room.id, 30);
      const advanced = (await rpc<Snapshot>(alice, "sync_room", [room.room.id])).data as Snapshot;
      if (roundIndex < 3) {
        expect(advanced.room.phase).toBe("round_active");
        expect(advanced.room.current_round).toBe(roundIndex + 1);
      } else {
        expect(advanced.room.phase).toBe("finished");
        expect(advanced.standings).toHaveLength(2);
        expect(advanced.standings[0].user_id).toBe(alice);
      }
    }

    const stats = await db.query<{ user_id: string; games_played: number; mode: string }>(
      `SELECT s.user_id, p.games_played, s.mode
       FROM app_private.profile_sessions s
       JOIN app_private.profile_private p ON p.user_id = s.user_id
       WHERE s.mode LIKE 'multiplayer%'
       ORDER BY s.user_id`
    );
    expect(stats.rows).toHaveLength(2);
    for (const row of stats.rows) {
      expect(row.games_played).toBe(1);
      expect(row.mode).toBe("multiplayer_capital");
    }

    // Un ulteriore sync non duplica le statistiche (stats_recorded).
    await rpc(alice, "sync_room", [room.room.id]);
    const after = await db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM app_private.profile_sessions WHERE mode LIKE 'multiplayer%'"
    );
    expect(after.rows[0].count).toBe("2");
  });
});

describe("Isolamento tra stanze simultanee", () => {
  it("non mescola punteggi, round e classifiche di stanze diverse", async () => {
    const roomA = await readyAndStart(await joinedRoom(alice, bob));
    const roomB = await readyAndStart(await joinedRoom(carol, dave), carol, dave);

    const correctA = await getRoundAnswer(db, roomA.room.id, 1);
    const correctB = await getRoundAnswer(db, roomB.room.id, 1);

    expect((await rpc(alice, "submit_answer", [roomA.room.id, 1, correctA])).error).toBeNull();
    expect((await rpc(carol, "submit_answer", [roomB.room.id, 1, correctB])).error).toBeNull();
    expect((await rpc(bob, "submit_answer", [roomA.room.id, 1, correctA])).error).toBeNull();
    expect((await rpc(dave, "submit_answer", [roomB.room.id, 1, correctB])).error).toBeNull();

    const snapA = (await rpc<Snapshot>(bob, "sync_room", [roomA.room.id])).data as Snapshot;
    expect(snapA.room.phase).toBe("round_reveal");
    expect(snapA.reveal?.results.map((r) => r.user_id).sort()).toEqual([alice, bob].sort());
    expect(snapA.standings.map((s) => s.user_id).sort()).toEqual([alice, bob].sort());
    expect(snapA.room.id).toBe(roomA.room.id);

    const snapB = (await rpc<Snapshot>(dave, "sync_room", [roomB.room.id])).data as Snapshot;
    expect(snapB.room.phase).toBe("round_reveal");
    expect(snapB.reveal?.results.map((r) => r.user_id).sort()).toEqual([carol, dave].sort());
    expect(snapB.standings.map((s) => s.user_id).sort()).toEqual([carol, dave].sort());
    expect(snapB.room.id).toBe(roomB.room.id);

    // Un membro della stanza A non può leggere lo stato della stanza B.
    const intruder = await rpc(alice, "get_room_state", [roomB.room.id]);
    expect(intruder.error).toContain("MG403:not_a_member");
  });
});
