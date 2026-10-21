import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ageMemberPresence,
  callRpc,
  callRpcAsServiceRole,
  callRpcWithRole,
  callTableRpc,
  normalizeRpc,
  createTestDb,
  createUser,
  execAsAdmin,
  getRoundAnswer,
  queryAs,
  shiftRoomClock,
  type TestDb,
} from "./harness";

/**
 * Test di integrazione del backend multiplayer: girano su PostgreSQL reale
 * (PGlite/WASM) applicando le migrazioni versionate del repository.
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
    round_seconds: number;
    round_ends_at: string | null;
    reveal_ends_at: string | null;
    closed_reason: string | null;
    lobby_expires_at: string;
  };
  me: {
    user_id: string;
    is_host: boolean;
    is_ready: boolean;
    score: number;
    connection: string;
    answered_current_round: boolean;
  } | null;
  players: { user_id: string; username: string; connection: string; is_ready: boolean }[];
  standings: { user_id: string; username: string; score: number; rank: number }[];
  round: {
    index: number;
    prompt: string;
    options: string[];
    answered_count: number;
  } | null;
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

async function rpc<T = Snapshot>(
  user: string | null,
  fn: string,
  params: unknown[] = []
): Promise<{ data: T | null; error: string | null }> {
  // Le RPC restituiscono errori strutturati `{ ok: false, error }` per non
  // perdere i contatori di rate limiting: qui vengono normalizzati come errori.
  return normalizeRpc<T>(await callRpc(db, user, fn, params));
}

async function newRoom(
  host: string = alice,
  params: unknown[] = ["Stanza Test", "capital", "easy", 3, 4, 20]
): Promise<Snapshot> {
  const res = await rpc<Snapshot>(host, "create_room", params);
  expect(res.error).toBeNull();
  expect(res.data).toBeTruthy();
  return res.data as Snapshot;
}

async function joinedRoom(host = alice, guest = bob): Promise<Snapshot> {
  const room = await newRoom(host);
  const joined = await rpc<Snapshot>(guest, "join_room", [room.room.code]);
  expect(joined.error).toBeNull();
  return joined.data as Snapshot;
}

async function readyAndStart(room: Snapshot, host = alice, guest = bob): Promise<Snapshot> {
  const ready = await rpc<Snapshot>(guest, "set_ready", [room.room.id, true]);
  expect(ready.error).toBeNull();
  const started = await rpc<Snapshot>(host, "start_game", [room.room.id]);
  expect(started.error).toBeNull();
  return started.data as Snapshot;
}

async function wrongOption(roomId: string, roundIndex: number, options: string[]): Promise<string> {
  const correct = await getRoundAnswer(db, roomId, roundIndex);
  const wrong = options.find((option) => option !== correct);
  if (!wrong) throw new Error("Nessuna opzione errata disponibile");
  return wrong;
}

beforeEach(async () => {
  db = await createTestDb();
  alice = await createUser(db, "alice@example.com", "Alice");
  bob = await createUser(db, "bob@example.com", "Bob");
  carol = await createUser(db, "carol@example.com", "Carol");
  // I test non intendono verificare i rate limit se non esplicitamente.
  await execAsAdmin(db, "UPDATE app_private.rate_limit_policies SET max_hits = 10000");
});

afterEach(async () => {
  await db.close();
});

describe("Creazione stanza e lobby", () => {
  it("crea una stanza con codice valido e host pronto", async () => {
    const room = await newRoom();
    expect(room.room.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(room.room.phase).toBe("lobby");
    expect(room.me?.is_host).toBe(true);
    expect(room.me?.is_ready).toBe(true);
    expect(room.players).toHaveLength(1);
    expect(room.reveal).toBeNull();
    expect(room.round).toBeNull();
  });

  it("permette a un secondo giocatore di entrare con il codice e mostra lo stato", async () => {
    const room = await newRoom();
    const joined = await rpc<Snapshot>(bob, "join_room", [room.room.code.toLowerCase()]);
    expect(joined.error).toBeNull();
    const snap = joined.data as Snapshot;
    expect(snap.players).toHaveLength(2);
    expect(snap.players.map((p) => p.username).sort()).toEqual(["Alice", "Bob"]);
    expect(snap.me?.is_ready).toBe(false);
    expect(snap.me?.is_host).toBe(false);
    expect(snap.players.every((p) => p.connection === "connected")).toBe(true);
  });

  it("permette al membro di rientrare con il codice durante la partita", async () => {
    const room = await readyAndStart(await joinedRoom());
    const correct = await getRoundAnswer(db, room.room.id, 1);
    await rpc(alice, "submit_answer", [room.room.id, 1, correct]);

    // Bob riapre il link d'invito a partita avviata: deve rientrare, non
    // ricevere "stanza non trovata".
    const rejoin = await rpc<Snapshot>(bob, "join_room", [room.room.code]);
    expect(rejoin.error).toBeNull();
    const snap = rejoin.data as Snapshot;
    expect(snap.room.phase).toBe("round_active");
    expect(snap.me?.user_id).toBe(bob);

    // Un estraneo, invece, non può entrare a partita avviata.
    const outsider = await rpc(carol, "join_room", [room.room.code]);
    expect(outsider.error).toContain("MG404:room_not_found");
  });

  it("non consente a un estraneo di leggere la stanza (RLS)", async () => {
    const room = await newRoom();
    const leak = await queryAs<{ id: string }>(db, carol, "SELECT id FROM public.game_rooms");
    expect(leak.error).toBeNull();
    expect(leak.rows).toHaveLength(0);

    const membersLeak = await queryAs<{ room_id: string }>(
      db,
      carol,
      "SELECT room_id FROM public.game_room_members WHERE room_id = $1",
      [room.room.id]
    );
    expect(membersLeak.rows).toHaveLength(0);

    const anonLeak = await queryAs<{ id: string }>(
      db,
      null,
      "SELECT id FROM public.game_rooms WHERE id = $1",
      [room.room.id]
    );
    expect(anonLeak.rows).toHaveLength(0);
  });
});

describe("Ingressi non autorizzati", () => {
  it("richiede autenticazione", async () => {
    // Il ruolo anon non ha nemmeno il permesso di eseguire le RPC.
    const anonymous = await callRpcWithRole(db, "anon", null, "create_room", [
      "Stanza",
      "capital",
      "easy",
      3,
      4,
      20,
    ]);
    expect(anonymous.error).toContain("permission denied for function create_room");

    // Sessione autenticata ma priva di claim `sub` (JWT scaduto/malformato).
    const missingSubject = normalizeRpc(
      await callRpcWithRole(db, "authenticated", null, "create_room", [
        "Stanza",
        "capital",
        "easy",
        3,
        4,
        20,
      ])
    );
    expect(missingSubject.error).toContain("MG401:authentication_required");
    expect(missingSubject.data).toBeNull();

    const join = normalizeRpc(
      await callRpcWithRole(db, "authenticated", null, "join_room", ["ABCDEF"])
    );
    expect(join.error).toContain("MG401:authentication_required");
  });

  it("rifiuta codici inesistenti o malformati con lo stesso errore", async () => {
    const missing = await rpc(carol, "join_room", ["ZZZZZZ"]);
    const malformed = await rpc(carol, "join_room", ["ABC"]);
    const injection = await rpc(carol, "join_room", ["ABC' OR 1=1 --"]);
    expect(missing.error).toContain("MG404:room_not_found");
    expect(malformed.error).toContain("MG404:room_not_found");
    expect(injection.error).toContain("MG404:room_not_found");
  });

  it("non conferma l'esistenza di una stanza avviata a chi non è membro", async () => {
    const room = await joinedRoom();
    await readyAndStart(room);
    const outsider = await rpc(carol, "join_room", [room.room.code]);
    expect(outsider.error).toContain("MG404:room_not_found");
  });

  it("blocca l'ingresso quando la stanza è piena", async () => {
    const room = await newRoom(alice, ["Piena", "capital", "easy", 3, 2, 20]);
    await rpc(bob, "join_room", [room.room.code]);
    const full = await rpc(carol, "join_room", [room.room.code]);
    expect(full.error).toContain("MG409:room_full");
  });

  it("impedisce l'ingresso a un giocatore espulso", async () => {
    const room = await joinedRoom();
    const kick = await rpc(alice, "kick_member", [room.room.id, carol]);
    expect(kick.error).toContain("MG404:member_not_found");

    const kickBob = await rpc<Snapshot>(alice, "kick_member", [room.room.id, bob]);
    expect(kickBob.error).toBeNull();

    const rejoinByCode = await rpc(bob, "join_room", [room.room.code]);
    expect(rejoinByCode.error).toContain("MG403:not_allowed");
    const reconnect = await rpc(bob, "reconnect_room", [room.room.id]);
    expect(reconnect.error).toContain("MG403:not_a_member");
  });
});

describe("Avvio partita e autorità del server", () => {
  it("solo l'host può avviare e servono tutti pronti", async () => {
    const room = await joinedRoom();
    const early = await rpc(alice, "start_game", [room.room.id]);
    expect(early.error).toContain("MG409:players_not_ready");

    await rpc(bob, "set_ready", [room.room.id, true]);
    const notHost = await rpc(bob, "start_game", [room.room.id]);
    expect(notHost.error).toContain("MG403:host_only");

    const started = await rpc<Snapshot>(alice, "start_game", [room.room.id]);
    expect(started.error).toBeNull();
    const snap = started.data as Snapshot;
    expect(snap.room.phase).toBe("round_active");
    expect(snap.room.current_round).toBe(1);
    expect(snap.round?.options.length).toBeGreaterThan(1);
    expect(snap.round?.prompt).toContain("capitale");
    expect(snap.reveal).toBeNull();
  });

  it("non espone la risposta corretta durante il round", async () => {
    const room = await readyAndStart(await joinedRoom());
    const snapshotJson = JSON.stringify(room);
    expect(snapshotJson).not.toContain("correct_answer");
    const answerRows = await queryAs<{ answer: string }>(
      db,
      alice,
      "SELECT answer FROM public.game_answers WHERE room_id = $1",
      [room.room.id]
    );
    expect(answerRows.rows).toHaveLength(0);

    const keyRows = await queryAs<{ correct_answer: string }>(
      db,
      alice,
      "SELECT correct_answer FROM app_private.round_keys WHERE room_id = $1",
      [room.room.id]
    );
    expect(keyRows.error).toContain("permission denied");
  });

  it("nasconde i round futuri e le risposte non rivelate via RLS", async () => {
    const room = await readyAndStart(await joinedRoom());
    const rounds = await queryAs<{ round_index: number }>(
      db,
      alice,
      "SELECT round_index FROM public.game_rounds WHERE room_id = $1 ORDER BY round_index",
      [room.room.id]
    );
    expect(rounds.rows.map((row) => row.round_index)).toEqual([1]);

    const correct = await getRoundAnswer(db, room.room.id, 1);
    await rpc(alice, "submit_answer", [room.room.id, 1, correct]);
    const answers = await queryAs<{ answer: string }>(
      db,
      bob,
      "SELECT answer FROM public.game_answers WHERE room_id = $1",
      [room.room.id]
    );
    expect(answers.rows).toHaveLength(0);
  });

  it("impedisce a un giocatore espulso di leggere la stanza", async () => {
    const room = await joinedRoom();
    await rpc(alice, "kick_member", [room.room.id, bob]);

    const rooms = await queryAs<{ id: string }>(
      db,
      bob,
      "SELECT id FROM public.game_rooms WHERE id = $1",
      [room.room.id]
    );
    expect(rooms.rows).toHaveLength(0);
    const members = await queryAs<{ user_id: string }>(
      db,
      bob,
      "SELECT user_id FROM public.game_room_members WHERE room_id = $1",
      [room.room.id]
    );
    expect(members.rows).toHaveLength(0);
  });

  it("non accetta risposte fuori dalle opzioni", async () => {
    const room = await readyAndStart(await joinedRoom());
    const res = await rpc(alice, "submit_answer", [room.room.id, 1, "Risposta inventata"]);
    expect(res.error).toContain("MG400:invalid_answer");

    const nullRes = await rpc(alice, "submit_answer", [room.room.id, 1, null]);
    expect(nullRes.error).toContain("MG400:invalid_answer");
  });

  it("accetta risposte simultanee di due giocatori e calcola i punteggi", async () => {
    const room = await readyAndStart(await joinedRoom());
    const correct = await getRoundAnswer(db, room.room.id, 1);
    const wrong = await wrongOption(room.room.id, 1, room.round!.options);

    const [aliceAnswer, bobAnswer] = await Promise.all([
      rpc<Snapshot>(alice, "submit_answer", [room.room.id, 1, correct]),
      rpc<Snapshot>(bob, "submit_answer", [room.room.id, 1, wrong]),
    ]);
    expect(aliceAnswer.error).toBeNull();
    expect(bobAnswer.error).toBeNull();

    const latest = await rpc<Snapshot>(alice, "sync_room", [room.room.id]);
    const snap = latest.data as Snapshot;
    expect(snap.room.phase).toBe("round_reveal");
    expect(snap.reveal?.correct_answer).toBe(correct);
    expect(snap.reveal?.results).toHaveLength(2);
    const aliceResult = snap.reveal?.results.find((r) => r.user_id === alice);
    const bobResult = snap.reveal?.results.find((r) => r.user_id === bob);
    expect(aliceResult?.is_correct).toBe(true);
    expect(aliceResult?.points).toBeGreaterThanOrEqual(100);
    expect(bobResult?.is_correct).toBe(false);
    expect(bobResult?.points).toBe(0);
    expect(snap.standings[0].user_id).toBe(alice);
  });

  it("impedisce risposte duplicate", async () => {
    const room = await readyAndStart(await joinedRoom());
    const correct = await getRoundAnswer(db, room.room.id, 1);
    const first = await rpc(alice, "submit_answer", [room.room.id, 1, correct]);
    expect(first.error).toBeNull();
    const second = await rpc(alice, "submit_answer", [room.room.id, 1, correct]);
    expect(second.error).toContain("MG409:duplicate_answer");

    // Le risposte non sono visibili via RLS finché il round non è rivelato:
    // la verifica avviene quindi come amministratore.
    const answers = await db.query<{ id: string }>(
      "SELECT id FROM public.game_answers WHERE room_id = $1 AND user_id = $2",
      [room.room.id, alice]
    );
    expect(answers.rows).toHaveLength(1);
  });

  it("impedisce risposte tarde quando il timer è scaduto", async () => {
    const room = await readyAndStart(await joinedRoom());
    const correct = await getRoundAnswer(db, room.room.id, 1);
    await shiftRoomClock(db, room.room.id, 60);

    const late = await rpc(alice, "submit_answer", [room.room.id, 1, correct]);
    expect(late.error).toContain("MG409:round_closed");

    const synced = await rpc<Snapshot>(alice, "sync_room", [room.room.id]);
    expect((synced.data as Snapshot).room.phase).toBe("round_reveal");
    expect((synced.data as Snapshot).reveal?.correct_answer).toBe(correct);

    const afterReveal = await rpc(bob, "submit_answer", [room.room.id, 1, correct]);
    expect(afterReveal.error).toContain("MG409:round_not_active");
  });

  it("rifiuta un round diverso da quello corrente", async () => {
    const room = await readyAndStart(await joinedRoom());
    const res = await rpc(alice, "submit_answer", [room.room.id, 2, room.round!.options[0]]);
    expect(res.error).toContain("MG409:wrong_round");
  });

  it("nasconde i punteggi parziali del round in corso", async () => {
    const room = await readyAndStart(await joinedRoom());
    const correct = await getRoundAnswer(db, room.room.id, 1);
    await rpc(alice, "submit_answer", [room.room.id, 1, correct]);

    const snap = (await rpc<Snapshot>(bob, "sync_room", [room.room.id])).data as Snapshot;
    expect(snap.room.phase).toBe("round_active");
    const aliceView = snap.players.find((p) => p.user_id === alice);
    expect(aliceView).toBeTruthy();
    expect((aliceView as unknown as { score: number }).score).toBe(0);
    expect(snap.reveal).toBeNull();
  });
});

describe("Disconnessione, riconnessione e host", () => {
  it("marca i giocatori silenziosi come disconnessi e permette il rientro", async () => {
    const room = await readyAndStart(await joinedRoom());
    await ageMemberPresence(db, room.room.id, 120);

    const afterHeartbeat = (await rpc<Snapshot>(alice, "heartbeat", [room.room.id]))
      .data as Snapshot;
    const bobView = afterHeartbeat.players.find((p) => p.user_id === bob);
    expect(bobView?.connection).toBe("disconnected");

    const reconnected = await rpc<Snapshot>(bob, "reconnect_room", [room.room.id]);
    expect(reconnected.error).toBeNull();
    const snap = reconnected.data as Snapshot;
    expect(snap.me?.connection ?? snap.players.find((p) => p.user_id === bob)?.connection).toBe(
      "connected"
    );
    expect(snap.room.phase).toBe("round_active");
  });

  it("trasferisce l'host se l'host resta disconnesso", async () => {
    const room = await readyAndStart(await joinedRoom());
    await ageMemberPresence(db, room.room.id, 300);

    const bobSnap = (await rpc<Snapshot>(bob, "heartbeat", [room.room.id])).data as Snapshot;
    expect(bobSnap.room.host_id).toBe(bob);
    expect(bobSnap.me?.is_host).toBe(true);

    const oldHostClose = await rpc(alice, "close_room", [room.room.id]);
    expect(oldHostClose.error).toContain("MG403:host_only");

    const newHostClose = await rpc<Snapshot>(bob, "close_room", [room.room.id]);
    expect(newHostClose.error).toBeNull();
    expect((newHostClose.data as Snapshot).room.phase).toBe("closed");
  });

  it("trasferisce l'host quando l'host esce volontariamente", async () => {
    const room = await joinedRoom();
    const left = await rpc<Snapshot>(alice, "leave_room", [room.room.id]);
    expect(left.error).toBeNull();

    const bobSnap = (await rpc<Snapshot>(bob, "sync_room", [room.room.id])).data as Snapshot;
    expect(bobSnap.room.host_id).toBe(bob);
    expect(bobSnap.me?.is_host).toBe(true);

    const closed = await rpc<Snapshot>(bob, "close_room", [room.room.id]);
    expect(closed.error).toBeNull();
    expect((closed.data as Snapshot).room.phase).toBe("closed");
  });

  it("chiude la stanza quando tutti escono", async () => {
    const room = await newRoom();
    const joined = (await rpc<Snapshot>(bob, "join_room", [room.room.code])).data as Snapshot;
    expect(joined.players).toHaveLength(2);

    await rpc<Snapshot>(bob, "leave_room", [room.room.id]);
    const left = await rpc<Snapshot>(alice, "leave_room", [room.room.id]);
    expect(left.error).toBeNull();
    const admin = await db.query<{ phase: string; closed_reason: string }>(
      "SELECT phase, closed_reason FROM public.game_rooms WHERE id = $1",
      [room.room.id]
    );
    expect(admin.rows[0].phase).toBe("closed");
    expect(admin.rows[0].closed_reason).toBe("empty");
  });
});

describe("Chiusura e manutenzione", () => {
  it("chiude la stanza solo su richiesta dell'host", async () => {
    const room = await joinedRoom();
    const outsider = await rpc(carol, "close_room", [room.room.id]);
    expect(outsider.error).toContain("MG403:host_only");
    const guest = await rpc(bob, "close_room", [room.room.id]);
    expect(guest.error).toContain("MG403:host_only");

    const closed = await rpc<Snapshot>(alice, "close_room", [room.room.id]);
    expect(closed.error).toBeNull();
    const snap = closed.data as Snapshot;
    expect(snap.room.phase).toBe("closed");
    expect(snap.room.closed_reason).toBe("host_closed");
    expect(snap.room.lobby_expires_at).toBeTruthy();

    const answer = await rpc(alice, "submit_answer", [room.room.id, 1, "Roma"]);
    expect(answer.error).toContain("MG409:round_not_active");
    const restart = await rpc(alice, "start_game", [room.room.id]);
    expect(restart.error).toMatch(/MG409:(game_already_started|room_closed)/);
  });

  it("la lettura dello stato non fa avanzare la fase", async () => {
    const room = await readyAndStart(await joinedRoom());
    await shiftRoomClock(db, room.room.id, 60);

    const readOnly = (await rpc<Snapshot>(alice, "get_room_state", [room.room.id]))
      .data as Snapshot;
    expect(readOnly.room.phase).toBe("round_active");

    const synced = (await rpc<Snapshot>(alice, "sync_room", [room.room.id])).data as Snapshot;
    expect(synced.room.phase).toBe("round_reveal");
  });

  it("permette la manutenzione da service_role (pg_cron)", async () => {
    const room = await newRoom();
    await shiftRoomClock(db, room.room.id, 4000);

    const tick = await callRpcAsServiceRole<{ ok: boolean; closed: number }>(
      db,
      "maintenance_tick"
    );
    expect(tick.error).toBeNull();
    expect(tick.data?.ok).toBe(true);
    expect(tick.data?.closed).toBeGreaterThanOrEqual(1);

    // Senza sessione (né utente né service_role) la RPC è rifiutata.
    const anonymousTick = await callRpcWithRole(db, "authenticated", null, "maintenance_tick");
    expect((anonymousTick.data as { ok?: boolean; error?: string } | null)?.error).toBe(
      "MG401:authentication_required"
    );
  });

  it("chiude le lobby scadute e archivia le stanze chiuse", async () => {
    const room = await newRoom();
    await shiftRoomClock(db, room.room.id, 4000);

    const tick = await rpc<{ closed: number }>(alice, "maintenance_tick");
    expect(tick.error).toBeNull();
    expect(tick.data?.closed).toBeGreaterThanOrEqual(1);

    const closed = await db.query<{ phase: string; closed_reason: string }>(
      "SELECT phase, closed_reason FROM public.game_rooms WHERE id = $1",
      [room.room.id]
    );
    expect(closed.rows[0].phase).toBe("closed");
    expect(closed.rows[0].closed_reason).toBe("lobby_expired");

    await execAsAdmin(
      db,
      "UPDATE public.game_rooms SET closed_at = now() - interval '10 days' WHERE id = $1",
      [room.room.id]
    );
    await rpc(alice, "maintenance_tick");
    const purged = await db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM public.game_rooms WHERE id = $1",
      [room.room.id]
    );
    expect(purged.rows[0].count).toBe("0");
  });

  it("applica il rate limit configurato", async () => {
    await execAsAdmin(
      db,
      "UPDATE app_private.rate_limit_policies SET max_hits = 2, window_seconds = 600 WHERE bucket = 'create_room'"
    );
    await newRoom();
    await newRoom();
    const third = await rpc(alice, "create_room", ["Terza", "capital", "easy", 3, 4, 20]);
    expect(third.error).toContain("MG429:rate_limited");

    await execAsAdmin(
      db,
      "UPDATE app_private.rate_limit_policies SET max_hits = 3, window_seconds = 3600 WHERE bucket = 'join_room'"
    );
    await rpc(carol, "join_room", ["ZZZZZZ"]);
    await rpc(carol, "join_room", ["ZZZZZY"]);
    await rpc(carol, "join_room", ["ZZZZZX"]);
    const blocked = await rpc(carol, "join_room", ["ZZZZZW"]);
    expect(blocked.error).toContain("MG429:rate_limited");
  });
});

describe("Punteggi e profili", () => {
  it("non permette di scrivere punteggi o fasi direttamente", async () => {
    const room = await readyAndStart(await joinedRoom());

    const updateScore = await queryAs(
      db,
      alice,
      "UPDATE public.game_room_members SET score = 99999 WHERE room_id = $1 AND user_id = $2",
      [room.room.id, alice]
    );
    expect(updateScore.error).toContain("permission denied");

    const updateRoom = await queryAs(
      db,
      alice,
      "UPDATE public.game_rooms SET phase = 'finished', current_round = 99 WHERE id = $1",
      [room.room.id]
    );
    expect(updateRoom.error).toContain("permission denied");

    const insertAnswer = await queryAs(
      db,
      alice,
      `INSERT INTO public.game_answers (room_id, round_index, user_id, answer, is_correct, points, response_ms)
       VALUES ($1, 1, $2, 'Roma', true, 200, 10)`,
      [room.room.id, alice]
    );
    expect(insertAnswer.error).toContain("permission denied");

    const insertRoom = await queryAs(
      db,
      alice,
      `INSERT INTO public.game_rooms (code, host_id, name, quiz_type, difficulty, max_players, total_rounds, round_seconds, lobby_expires_at)
       VALUES ('AAAAAA', $1, 'Falsa', 'capital', 'easy', 4, 3, 20, now() + interval '1 hour')`,
      [alice]
    );
    expect(insertRoom.error).toContain("permission denied");

    const eventLeak = await queryAs(
      db,
      alice,
      "INSERT INTO public.game_events (room_id, event_type) VALUES ($1, 'fake_event')",
      [room.room.id]
    );
    expect(eventLeak.error).toContain("permission denied");
  });

  it("non consente modifiche arbitrarie a profili e classifiche", async () => {
    const username = await rpc(alice, "set_username", ["AliceNuova"]);
    expect(username.error).toBeNull();

    const steal = await rpc(alice, "set_username", ["Bob"]);
    expect(steal.error).toContain("MG409:username_taken");

    const invalid = await rpc(alice, "set_username", ["a"]);
    expect(invalid.error).toContain("MG400:invalid_username");

    const levelUpdate = await queryAs(db, alice, "UPDATE public.profiles SET level = 99");
    expect(levelUpdate.error).toContain("permission denied");

    const privateRead = await queryAs(db, alice, "SELECT email FROM app_private.profile_private");
    expect(privateRead.error).toContain("permission denied");

    const emailColumn = await queryAs(db, alice, "SELECT email FROM public.profiles");
    expect(emailColumn.error).toContain("does not exist");
  });

  it("valida i punteggi singoli lato server e aggiorna classifica e profilo", async () => {
    const tooBig = await rpc(alice, "record_solo_game", ["challenge", "easy", 999999, 5, 5, 100]);
    expect(tooBig.error).toContain("MG400:invalid_score");

    const tooMuchXp = await rpc(alice, "record_solo_game", [
      "challenge",
      "easy",
      500,
      5,
      5,
      999999,
    ]);
    expect(tooMuchXp.error).toContain("MG400:invalid_xp");

    const ok = await rpc<{ total_score: number; games_played: number }>(alice, "record_solo_game", [
      "challenge",
      "easy",
      500,
      5,
      4,
      120,
    ]);
    expect(ok.error).toBeNull();
    expect(ok.data?.total_score).toBe(500);
    expect(ok.data?.games_played).toBe(1);

    const board = await callTableRpc<{ username: string; total_score: number }>(
      db,
      null,
      "get_leaderboard",
      ["all"]
    );
    expect(board.error).toBeNull();
    expect(board.rows[0].username).toBe("Alice");
    expect(board.rows[0].total_score).toBe(500);
    expect(JSON.stringify(board.rows)).not.toContain("alice@example.com");
  });

  it("registra la classifica finale multiplayer una sola volta", async () => {
    const room = await readyAndStart(await joinedRoom(), alice, bob);
    let snap = room;

    for (let round = 1; round <= 3; round++) {
      const correct = await getRoundAnswer(db, room.room.id, round);
      await rpc(alice, "submit_answer", [room.room.id, round, correct]);
      const wrong = await wrongOption(room.room.id, round, snap.round!.options);
      await rpc(bob, "submit_answer", [room.room.id, round, wrong]);

      if (round < 3) {
        await shiftRoomClock(db, room.room.id, 15);
        const next = await rpc<Snapshot>(alice, "sync_room", [room.room.id]);
        snap = next.data as Snapshot;
        expect(snap.room.current_round).toBe(round + 1);
        expect(snap.room.phase).toBe("round_active");
      }
    }

    await shiftRoomClock(db, room.room.id, 15);
    const finished = (await rpc<Snapshot>(alice, "sync_room", [room.room.id])).data as Snapshot;
    expect(finished.room.phase).toBe("finished");
    expect(finished.standings[0].user_id).toBe(alice);
    expect(finished.standings[0].score).toBeGreaterThan(0);

    const stats = await db.query<{ total_score: number; games_played: number; games_won: number }>(
      "SELECT p.total_score, p.games_played, p.games_won FROM app_private.profile_private p WHERE p.user_id = $1",
      [alice]
    );
    expect(stats.rows[0].games_played).toBe(1);
    expect(stats.rows[0].games_won).toBe(1);
    expect(stats.rows[0].total_score).toBe(finished.standings[0].score);

    // Chiamate ripetute non duplicano le statistiche.
    await rpc(alice, "sync_room", [room.room.id]);
    const statsAgain = await db.query<{ games_played: number }>(
      "SELECT games_played FROM app_private.profile_private WHERE user_id = $1",
      [alice]
    );
    expect(statsAgain.rows[0].games_played).toBe(1);
  });
});
