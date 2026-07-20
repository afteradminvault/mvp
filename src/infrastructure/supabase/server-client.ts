import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { clientEnv } from "@/config/env";

/**
 * Supabase client for use in Server Components, Route Handlers, and Server
 * Actions. Reads/writes auth cookies via Next.js's `cookies()` API, per
 * Supabase's documented App Router SSR pattern.
 *
 * The `setAll` no-op catch matters: Server Components can't write cookies
 * (Next.js throws if you try), but that's fine there because
 * `src/middleware.ts` refreshes the session cookie on every request before
 * a Server Component ever runs. Route Handlers and Server Actions *can*
 * write cookies, and for those call sites this does the real work.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component render — no-op, see doc comment above.
          }
        },
      },
    },
  );
}
