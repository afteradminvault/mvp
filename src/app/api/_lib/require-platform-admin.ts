import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";

/**
 * Application-layer gate for /api/admin/* routes, mirroring
 * require-session.ts. platform_admins has no RLS policies at all — only
 * the service role can read it directly (supabase/migrations/
 * 20260719120100_rls_policies.sql) — so membership is checked via the
 * is_platform_admin() SQL function (security definer, exposed as an RPC),
 * not a direct table query, which the session's own client couldn't do
 * anyway. This is the primary authorization gate for admin writes; RLS
 * (legal_requirements_admin_write etc., same is_platform_admin() check)
 * is the defense-in-depth backstop, not the other way around.
 */
export async function requirePlatformAdmin(): Promise<
  { supabase: SupabaseClient; userId: string } | { unauthorized: NextResponse }
> {
  const supabase = await createSupabaseServerClient();
  const { data: user, error: userError } = await supabase.auth.getUser();
  if (userError || !user.user) {
    return { unauthorized: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }

  const { data: isAdmin, error: adminCheckError } = await supabase.rpc("is_platform_admin");
  if (adminCheckError || !isAdmin) {
    return { unauthorized: NextResponse.json({ error: "Platform admin access required." }, { status: 403 }) };
  }

  return { supabase, userId: user.user.id };
}
