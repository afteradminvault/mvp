import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clientEnv, getServerEnv } from "@/config/env";

/**
 * Bypasses RLS entirely (Supabase's `service_role` Postgres role has the
 * BYPASSRLS attribute) — for server-only code with no user session to
 * authenticate as, such as Vercel Cron-triggered background jobs. Never
 * import this from a Client Component or anywhere reachable by the browser.
 */
export function createSupabaseServiceRoleClient(): SupabaseClient {
  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();
  return createClient(clientEnv.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
