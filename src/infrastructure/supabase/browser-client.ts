import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/config/env";

/**
 * Supabase client for use in Client Components. Safe to call repeatedly —
 * the underlying client is lightweight and stateless beyond auth storage.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
