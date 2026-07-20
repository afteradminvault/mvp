import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";

/**
 * Application-layer auth gate for Route Handlers — defense-in-depth
 * alongside RLS (docs/SECURITY_ARCHITECTURE.md §3.2): RLS would reject
 * unauthenticated writes anyway, but failing fast with a clear 401 here
 * avoids leaking "does this row exist" information via a confusing
 * downstream RLS-driven 404/empty-result instead.
 */
export async function requireSession(): Promise<
  { supabase: SupabaseClient; userId: string } | { unauthorized: NextResponse }
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { unauthorized: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }
  return { supabase, userId: data.user.id };
}
