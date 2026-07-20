import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { clientEnv } from "@/config/env";

/**
 * Refreshes the Supabase auth session cookie on every matched request.
 * Required by Supabase's SSR pattern: without this, a Server Component's
 * session can silently expire mid-visit because Server Components can't
 * write cookies themselves (see server-client.ts).
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Touching getUser() is what actually triggers the refresh-if-needed logic;
  // getSession() alone would just read the (possibly stale) local cookie.
  await supabase.auth.getUser();

  return response;
}
