import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import {
  isSupabaseConfigured,
  SUPABASE_ANON_KEY,
  SUPABASE_SETUP_MESSAGE,
  SUPABASE_URL,
} from "@/lib/supabase/config";

/**
 * Client Supabase per Server Components e Route Handlers.
 */
export async function createServerSupabaseClient() {
  if (!isSupabaseConfigured) {
    throw new Error(SUPABASE_SETUP_MESSAGE);
  }
  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Ignorato nei Server Components di sola lettura.
        }
      },
    },
  });
}
