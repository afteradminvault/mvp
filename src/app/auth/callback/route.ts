import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";

/**
 * PKCE callback for Supabase Auth email links (signup confirmation, and
 * later password-reset/magic-link flows). Supabase's confirmation email
 * redirects here with a `?code=...` query param — this exchanges it for a
 * real session (setting the auth cookies via createSupabaseServerClient's
 * cookie handling) before sending the user on. Without this route, the
 * code param is never consumed and the user lands on a page with a dead
 * query string, still logged out.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/estates`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
