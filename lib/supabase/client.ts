import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export const OFFLINE_ERROR_MESSAGE = "Modalità offline attiva";

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
  const timer = setTimeout(() => controller.abort(), 3000);
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
 */
export function createClient(): SupabaseClient<Database> {
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
