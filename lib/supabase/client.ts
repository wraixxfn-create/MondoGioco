import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  isSupabaseConfigured,
  SUPABASE_ANON_KEY,
  SUPABASE_SETUP_MESSAGE,
  SUPABASE_URL,
} from "@/lib/supabase/config";

export const OFFLINE_ERROR_MESSAGE = "Modalità offline attiva";
export const NOT_CONFIGURED_ERROR = "SUPABASE_NOT_CONFIGURED";

let browserClient: SupabaseClient<Database> | null = null;
let offlineUntil = 0;

function makeOfflineResponse(): Response {
  return new Response(
    JSON.stringify({
      code: "OFFLINE",
      message: OFFLINE_ERROR_MESSAGE,
    }),
    {
      status: 400,
      statusText: "Offline",
      headers: { "Content-Type": "application/json" },
    }
  );
}

/**
 * Fetch con timeout rapido e circuit-breaker:
 * - online: restituisce la risposta reale di Supabase senza modifiche;
 * - offline / rete bloccata: evita i lunghi retry automatici e attiva subito
 *   il salvataggio locale sul dispositivo.
 */
const fetchWithTimeout: typeof fetch = async (input, init) => {
  if (Date.now() < offlineUntil) {
    return makeOfflineResponse();
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    return await fetch(input, {
      ...init,
      signal: init?.signal ?? controller.signal,
    });
  } catch {
    offlineUntil = Date.now() + 10_000;
    return makeOfflineResponse();
  } finally {
    clearTimeout(timer);
  }
};

export function resetOfflineCircuitBreaker(): void {
  offlineUntil = 0;
}

/**
 * Restituisce il client Supabase condiviso lato browser.
 *
 * Se Supabase non è configurato solleva un errore esplicito: non deve mai
 * esistere un "finto cloud" locale. Chi gestisce funzionalità opzionali deve
 * controllare prima `isSupabaseConfigured` o usare `getBrowserClient()`.
 */
export function createClient(): SupabaseClient<Database> {
  if (!isSupabaseConfigured) {
    throw new Error(NOT_CONFIGURED_ERROR);
  }
  if (!browserClient) {
    browserClient = createSupabaseClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: {
        fetch: fetchWithTimeout,
      },
    });
  }
  return browserClient;
}

/** Restituisce il client oppure `null` se Supabase non è configurato. */
export function getBrowserClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured) return null;
  return createClient();
}

export { SUPABASE_SETUP_MESSAGE };
