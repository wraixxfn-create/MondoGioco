/**
 * Configurazione pubblica Supabase per MondoGioco.
 *
 * Il progetto è già collegato e pronto all'uso senza dover configurare
 * manualmente un file `.env.local` (protetto da Row Level Security lato DB).
 * Se vuoi collegare un tuo progetto Supabase diverso, imposta le variabili
 * d'ambiente `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
 */
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://qnwalsrbbmktpcyglcdg.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFud2Fsc3JiYm1rdHBjeWdsY2RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2MTEyMDIsImV4cCI6MjEwODE4NzIwMn0.RQGAflMqvyhNWxSi55nnfY7o4wv8HFLi0rc4dgQaxRQ";
