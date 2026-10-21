/**
 * Harness PostgreSQL per i test del backend multiplayer.
 *
 * Usa PGlite (PostgreSQL compilato in WASM) così i test girano davvero contro
 * Postgres — RLS, vincoli, funzioni PL/pgSQL, transazioni — senza dipendere da
 * credenziali Supabase o da un servizio esterno.
 *
 * Viene ricostruito un sottoinsieme fedele dell'ambiente Supabase:
 *   - ruoli `anon`, `authenticated`, `service_role`
 *   - schema `auth` con `auth.users` e `auth.uid()` basata su GUC
 *   - pubblicazione `supabase_realtime`
 *
 * I test NON sostituiscono una verifica sull'istanza Supabase reale: vedi
 * docs/SUPABASE_SETUP.md per le verifiche che richiedono credenziali.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");

const SUPABASE_SHIM = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  raw_user_meta_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(
    COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      auth.jwt() ->> 'sub'
    ),
    ''
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    auth.jwt() ->> 'role'
  );
$$;

-- L'estensione uuid-ossp non e' disponibile in PGlite: la funzione usata dalla
-- prima migrazione viene emulata con gen_random_uuid() (equivalente per UUID v4).
CREATE OR REPLACE FUNCTION public.uuid_generate_v4() RETURNS UUID
LANGUAGE sql VOLATILE AS $$ SELECT gen_random_uuid(); $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE PUBLICATION supabase_realtime;
`;

export type TestDb = PGlite;

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

/**
 * Applica tutte le migrazioni versionate in ordine.
 */
export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);

  for (const file of migrationFiles()) {
    let sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
    if (file.startsWith("001")) {
      // L'estensione non è disponibile in WASM; la funzione è già emulata.
      sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/i, "");
    }
    try {
      await db.exec(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migrazione ${file} fallita: ${message}`);
    }
  }

  return db;
}

export async function createUser(db: TestDb, email: string, username?: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO auth.users (email, raw_user_meta_data)
     VALUES ($1, $2::jsonb) RETURNING id`,
    [email, JSON.stringify({ username: username ?? email.split("@")[0] })]
  );
  return result.rows[0].id;
}

/**
 * Esegue `fn` impersonando un utente autenticato (ruolo `authenticated` +
 * claim `sub` come farebbe PostgREST con un JWT).
 */
// PGlite usa una singola connessione: le impostazioni di sessione (ruolo e
// claim) sono globali. Questo mutex evita che due "client" concorrenti si
// sovrascrivano il contesto a vicenda.
let sessionQueue: Promise<unknown> = Promise.resolve();

export async function asUser<T>(
  db: TestDb,
  userId: string | null,
  fn: () => Promise<T>
): Promise<T> {
  const run = sessionQueue.then(() => withSession(db, userId, fn));
  sessionQueue = run.catch(() => undefined);
  return run;
}

async function withSession<T>(db: TestDb, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.query("SELECT set_config('request.jwt.claim.role', $1, false)", [
    userId ? "authenticated" : "anon",
  ]);
  await db.exec(`SET ROLE ${userId ? "authenticated" : "anon"}`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
    await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
    await db.query("SELECT set_config('request.jwt.claim.role', '', false)");
  }
}

/** Normalizza i risultati strutturati `{ ok: false, error }` delle RPC. */
export function normalizeRpc<T>(response: { data: unknown; error: string | null }): {
  data: T | null;
  error: string | null;
} {
  const data = response.data;
  if (data && typeof data === "object" && (data as { ok?: boolean }).ok === false) {
    return {
      data: null,
      error: String((data as { error?: string }).error ?? "MG500:unknown_error"),
    };
  }
  return { data: (data as T | null) ?? null, error: response.error };
}

/** Esegue una RPC come utente e restituisce `data` oppure l'errore. */
export async function callRpc<T = unknown>(
  db: TestDb,
  userId: string | null,
  functionName: string,
  params: unknown[] = []
): Promise<{ data: T | null; error: string | null }> {
  const placeholders = params.map((_, index) => `$${index + 1}`).join(", ");
  return asUser(db, userId, async () => {
    try {
      const result = await db.query<{ data: T }>(
        `SELECT public.${functionName}(${placeholders}) AS data`,
        params
      );
      return { data: result.rows[0]?.data ?? null, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { data: null, error: message };
    }
  });
}

/** Esegue una query come utente (per i test RLS). */
export async function queryAs<T>(
  db: TestDb,
  userId: string | null,
  sql: string,
  params: unknown[] = []
): Promise<{ rows: T[]; error: string | null }> {
  return asUser(db, userId, async () => {
    try {
      const result = await db.query<T>(sql, params);
      return { rows: result.rows, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { rows: [], error: message };
    }
  });
}

export async function execAsAdmin(db: TestDb, sql: string, params: unknown[] = []): Promise<void> {
  await db.exec("RESET ROLE");
  await db.query(sql, params);
}

/** Simula lo scorrere del tempo spostando i timestamp lato server (setup test). */
export async function shiftRoomClock(db: TestDb, roomId: string, seconds: number): Promise<void> {
  await execAsAdmin(
    db,
    `UPDATE public.game_rooms
     SET round_started_at = round_started_at - make_interval(secs => $2),
         round_ends_at = round_ends_at - make_interval(secs => $2),
         reveal_ends_at = CASE WHEN reveal_ends_at IS NULL THEN NULL ELSE reveal_ends_at - make_interval(secs => $2) END,
         phase_started_at = phase_started_at - make_interval(secs => $2),
         lobby_expires_at = lobby_expires_at - make_interval(secs => $2),
         last_activity_at = last_activity_at - make_interval(secs => $2)
     WHERE id = $1`,
    [roomId, seconds]
  );
  await execAsAdmin(
    db,
    `UPDATE public.game_rounds
     SET started_at = CASE WHEN started_at IS NULL THEN NULL ELSE started_at - make_interval(secs => $2) END,
         ends_at = CASE WHEN ends_at IS NULL THEN NULL ELSE ends_at - make_interval(secs => $2) END
     WHERE room_id = $1`,
    [roomId, seconds]
  );
}

/** Invecchia la presenza dei membri (simula assenza di heartbeat). */
export async function ageMemberPresence(
  db: TestDb,
  roomId: string,
  seconds: number
): Promise<void> {
  await execAsAdmin(
    db,
    `UPDATE public.game_room_members
     SET last_seen_at = last_seen_at - make_interval(secs => $2),
         joined_at = joined_at - make_interval(secs => $2)
     WHERE room_id = $1`,
    [roomId, seconds]
  );
}

/** Legge una risposta corretta direttamente dal backend (solo per i test). */
export async function getRoundAnswer(
  db: TestDb,
  roomId: string,
  roundIndex: number
): Promise<string> {
  const result = await db.query<{ correct_answer: string }>(
    `SELECT correct_answer FROM app_private.round_keys WHERE room_id = $1 AND round_index = $2`,
    [roomId, roundIndex]
  );
  return result.rows[0].correct_answer;
}

/**
 * Esegue una funzione che restituisce una tabella (RETURNS TABLE) e ne
 * restituisce tutte le righe.
 */
export async function callTableRpc<T = Record<string, unknown>>(
  db: TestDb,
  userId: string | null,
  functionName: string,
  params: unknown[] = []
): Promise<{ rows: T[]; error: string | null }> {
  const placeholders = params.map((_, index) => `$${index + 1}`).join(", ");
  return asUser(db, userId, async () => {
    try {
      const result = await db.query<T>(
        `SELECT * FROM public.${functionName}(${placeholders})`,
        params
      );
      return { rows: result.rows, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { rows: [], error: message };
    }
  });
}

/** Esegue una RPC con un ruolo esplicito (per testare anon vs authenticated). */
export async function callRpcWithRole<T = unknown>(
  db: TestDb,
  role: "anon" | "authenticated",
  userId: string | null,
  functionName: string,
  params: unknown[] = []
): Promise<{ data: T | null; error: string | null }> {
  return asUser(db, userId, async () => {
    await db.exec(`SET ROLE ${role}`);
    try {
      const placeholders = params.map((_, index) => `$${index + 1}`).join(", ");
      const result = await db.query<{ data: T }>(
        `SELECT public.${functionName}(${placeholders}) AS data`,
        params
      );
      return { data: result.rows[0]?.data ?? null, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { data: null, error: message };
    } finally {
      await db.exec("RESET ROLE");
    }
  });
}

/** Esegue una RPC come `service_role` (usato per testare il job di manutenzione). */
export async function callRpcAsServiceRole<T = unknown>(
  db: TestDb,
  functionName: string,
  params: unknown[] = []
): Promise<{ data: T | null; error: string | null }> {
  return asUser(db, null, async () => {
    await db.exec("SET ROLE service_role");
    await db.query("SELECT set_config('request.jwt.claim.role', 'service_role', false)");
    try {
      const placeholders = params.map((_, index) => `$${index + 1}`).join(", ");
      const result = await db.query<{ data: T }>(
        `SELECT public.${functionName}(${placeholders}) AS data`,
        params
      );
      return { data: result.rows[0]?.data ?? null, error: null };
    } catch (error) {
      return { data: null, error: error instanceof Error ? error.message : String(error) };
    } finally {
      await db.exec("RESET ROLE");
    }
  });
}
