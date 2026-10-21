/**
 * Configurazione pubblica Supabase per MondoGioco.
 *
 * IMPORTANTE
 * ----------
 * Nel repository NON sono presenti URL o chiavi reali. Per usare il cloud
 * (classifiche online e multiplayer) devi creare un progetto Supabase e
 * impostare in `.env.local`:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
 *
 * Solo la **anon key** può stare nel client: è una chiave pubblica pensata per
 * essere esposta, protetta da Row Level Security. La `service_role` key
 * aggira RLS e non deve MAI essere inserita in variabili `NEXT_PUBLIC_*`,
 * nel repository o nel browser.
 *
 * Il gioco in singolo funziona anche senza configurazione (progressi salvati
 * sul dispositivo). Il multiplayer online richiede Supabase: in assenza di
 * configurazione viene mostrato un avviso, non una finta partita.
 */
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");

export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

function looksLikePlaceholder(value: string): boolean {
  return /your-|placeholder|example\.com|<.*>/i.test(value);
}

export const isSupabaseConfigured: boolean =
  /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(SUPABASE_URL) &&
  SUPABASE_ANON_KEY.split(".").length === 3 &&
  SUPABASE_ANON_KEY.length > 40 &&
  !looksLikePlaceholder(SUPABASE_URL) &&
  !looksLikePlaceholder(SUPABASE_ANON_KEY);

export const SUPABASE_SETUP_MESSAGE =
  "Supabase non è configurato: imposta NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (vedi docs/SUPABASE_SETUP.md).";

export const SUPABASE_REALTIME_DISABLED_MESSAGE =
  "Supabase Realtime non è attivo sul progetto: il multiplayer usa comunque la sincronizzazione periodica via RPC.";
