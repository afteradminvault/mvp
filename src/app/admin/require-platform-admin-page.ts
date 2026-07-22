import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";

/**
 * Server Component equivalent of src/app/api/_lib/require-platform-admin.ts.
 * Needed because jurisdictions/providers/legal_requirements' SELECT RLS
 * policies are unconditionally open (`using (true)`) — only writes are
 * is_platform_admin()-gated — so a non-admin loading these admin pages
 * directly would otherwise still see the data via a plain server-side
 * query. Redirect before rendering anything, not after.
 */
export async function requirePlatformAdminForPage(): Promise<SupabaseClient> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) {
    redirect("/estates");
  }

  return supabase;
}
