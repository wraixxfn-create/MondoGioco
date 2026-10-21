#!/usr/bin/env node
/**
 * Verifica end-to-end del backend Supabase REALE.
 *
 * Non fa parte dei test automatici perché richiede credenziali reali.
 * Usa SOLO la anon key + accesso anonimo: nessuna service_role key.
 *
 * Uso:
 *   node --env-file-if-exists=.env.local scripts/verify-remote.mjs
 *   npm run verify:remote
 *
 * Esce con codice 0 se tutti i controlli passano, 1 altrimenti.
 */
import { createClient } from "@supabase/supabase-js";

const URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").replace(
  /\/+$/,
  ""
);
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

if (!URL || !ANON_KEY) {
  console.error(
    "\n✖ Credenziali assenti.\n  Imposta NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local\n  (vedi docs/SUPABASE_SETUP.md). Questo script non usa la service_role key.\n"
  );
  process.exit(2);
}

const results = [];
let failures = 0;

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  results.push({ name, ok, detail });
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function newClient() {
  return createClient(URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function signInAnonymous(label) {
  const client = newClient();
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(
      `${label}: accesso anonimo non riuscito (${error?.message ?? "nessun utente"}). ` +
        "Abilita Authentication → Providers → Anonymous nella dashboard Supabase."
    );
  }
  return { client, userId: data.user.id };
}

function containsAnswerKey(value) {
  return JSON.stringify(value ?? {}).includes("correct_answer");
}

async function main() {
  console.log(`\nVerifica Supabase: ${URL}\n${"-".repeat(50)}`);

  // 1. RPC pubblica e orologio
  const probe = newClient();
  const time = await probe.rpc("server_time");
  const skew =
    time.data && !time.error ? Math.abs(Date.now() - new Date(time.data).getTime()) : Infinity;
  check("RPC server_time raggiungibile", !time.error && Boolean(time.data), time.error?.message);
  check(
    "Orologio del progetto allineato (±60s)",
    skew < 60_000,
    `scarto ${Math.round(skew / 1000)}s`
  );

  // 2. Profili: pubblici in lettura, email non esposta
  const profiles = await probe.from("profiles").select("id, username, level").limit(1);
  check(
    "Tabella profiles leggibile (solo campi pubblici)",
    !profiles.error,
    profiles.error?.message
  );
  const emailProbe = await probe.from("profiles").select("email").limit(1);
  check("Colonna email assente da profiles", Boolean(emailProbe.error), emailProbe.error?.message);

  // 3. Tabelle multiplayer protette da RLS per anon
  const rooms = await probe.from("game_rooms").select("id, code").limit(1);
  const roomsExposed = !rooms.error && (rooms.data?.length ?? 0) > 0;
  check(
    "game_rooms non leggibile da anon (RLS/permessi)",
    !roomsExposed,
    rooms.error?.message ?? `righe: ${rooms.data?.length ?? 0}`
  );

  const answers = await probe.from("game_answers").select("answer").limit(1);
  check("game_answers non leggibile da anon", answers.error || (answers.data?.length ?? 0) === 0);

  // 4. Schema privato non esposto via REST
  const privateProbe = await fetch(`${URL}/rest/v1/question_bank?select=id&limit=1`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  check(
    "Banca domande (app_private) non esposta via REST",
    privateProbe.status === 404 || privateProbe.status === 401 || privateProbe.status === 400,
    `HTTP ${privateProbe.status}`
  );

  // 5. Impostazioni pubbliche
  const settings = await probe.from("game_settings").select("*").eq("id", 1).maybeSingle();
  check(
    "Impostazioni di gioco leggibili",
    !settings.error && Boolean(settings.data),
    settings.error?.message
  );

  // 6. Due sessioni reali e flusso multiplayer completo
  const alice = await signInAnonymous("Alice");
  const bob = await signInAnonymous("Bob");
  check("Accesso anonimo abilitato (due sessioni)", true);

  let roomId = null;
  try {
    const created = await alice.client.rpc("create_room", {
      p_name: "Verifica remota",
      p_quiz_type: "capital",
      p_difficulty: "easy",
      p_total_rounds: 3,
      p_max_players: 4,
      p_round_seconds: 15,
    });
    if (created.error) throw new Error(created.error.message);
    const createdSnapshot = created.data;
    roomId = createdSnapshot?.room?.id ?? null;
    check(
      "Creazione stanza da utente autenticato",
      createdSnapshot?.ok === true &&
        Boolean(roomId) &&
        /^[A-HJ-NP-Z2-9]{6}$/.test(createdSnapshot.room.code),
      createdSnapshot?.error ?? createdSnapshot?.room?.code
    );
    check("Lo snapshot iniziale non contiene soluzioni", !containsAnswerKey(createdSnapshot));

    const code = createdSnapshot.room.code;
    const joined = await bob.client.rpc("join_room", { p_code: code });
    check(
      "Ingresso con codice e lobby con 2 partecipanti",
      joined.data?.ok === true && joined.data?.players?.length === 2,
      joined.data?.error ?? joined.error?.message
    );
    check(
      "Un non membro non vede la stanza",
      await (async () => {
        const outsider = await signInAnonymous("Charlie");
        const leak = await outsider.client.from("game_rooms").select("id").eq("id", roomId);
        return !leak.error && (leak.data?.length ?? 0) === 0;
      })()
    );

    const readyA = await alice.client.rpc("set_ready", { p_room_id: roomId, p_ready: true });
    const readyB = await bob.client.rpc("set_ready", { p_room_id: roomId, p_ready: true });
    check("Indicatore di pronto", readyA.data?.ok === true && readyB.data?.ok === true);

    const notHost = await bob.client.rpc("start_game", { p_room_id: roomId });
    check(
      "Solo l'host può avviare",
      notHost.data?.ok === false && notHost.data?.error === "MG403:host_only"
    );

    const started = await alice.client.rpc("start_game", { p_room_id: roomId });
    check(
      "Avvio partita e round sincronizzato",
      started.data?.ok === true &&
        started.data?.room?.phase === "round_active" &&
        started.data?.room?.current_round === 1 &&
        Array.isArray(started.data?.round?.options),
      started.data?.error
    );
    check("Le soluzioni non sono esposte durante il round", !containsAnswerKey(started.data));

    const options = started.data?.round?.options ?? [];
    const first = options[0];
    const answerA = await alice.client.rpc("submit_answer", {
      p_room_id: roomId,
      p_round_index: 1,
      p_answer: first,
    });
    check("Risposta accettata dal server", answerA.data?.ok === true, answerA.data?.error);

    const duplicate = await alice.client.rpc("submit_answer", {
      p_room_id: roomId,
      p_round_index: 1,
      p_answer: first,
    });
    check(
      "Risposta duplicata rifiutata",
      duplicate.data?.ok === false && duplicate.data?.error === "MG409:duplicate_answer"
    );

    const answerB = await bob.client.rpc("submit_answer", {
      p_room_id: roomId,
      p_round_index: 1,
      p_answer: options[1] ?? first,
    });
    check("Seconda risposta accettata", answerB.data?.ok === true, answerB.data?.error);

    let revealed = answerB.data;
    for (let attempt = 0; attempt < 5 && revealed?.room?.phase !== "round_reveal"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const sync = await alice.client.rpc("sync_room", { p_room_id: roomId });
      revealed = sync.data ?? revealed;
    }
    check(
      "Chiusura round e rivelazione della soluzione",
      revealed?.room?.phase === "round_reveal" &&
        typeof revealed?.reveal?.correct_answer === "string" &&
        revealed?.reveal?.results?.length === 2,
      revealed?.room?.phase
    );

    const closed = await alice.client.rpc("close_room", { p_room_id: roomId });
    check(
      "Chiusura stanza da parte dell'host",
      closed.data?.ok === true && closed.data?.room?.phase === "closed"
    );

    const late = await bob.client.rpc("submit_answer", {
      p_room_id: roomId,
      p_round_index: 1,
      p_answer: first,
    });
    check(
      "Nessuna risposta accettata a stanza chiusa",
      late.data?.ok === false && late.data?.error === "MG409:round_not_active"
    );
  } catch (error) {
    check(
      "Flusso multiplayer completo",
      false,
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    if (roomId) {
      await alice.client.rpc("close_room", { p_room_id: roomId });
      await alice.client.rpc("leave_room", { p_room_id: roomId });
      await bob.client.rpc("leave_room", { p_room_id: roomId });
    }
    await alice.client.auth.signOut();
    await bob.client.auth.signOut();
  }

  console.log(`${"-".repeat(50)}`);
  console.log(
    failures === 0
      ? `✔ Tutti i ${results.length} controlli sono passati.`
      : `✘ ${failures}/${results.length} controlli falliti.`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Errore inatteso:", error);
  process.exit(1);
});
