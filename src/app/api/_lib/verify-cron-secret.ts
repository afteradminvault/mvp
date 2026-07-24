import { NextResponse } from "next/server";
import { getServerEnv } from "@/config/env";

/**
 * Shared Authorization check for every Vercel Cron-triggered route. Vercel
 * sends `Authorization: Bearer $CRON_SECRET` on cron invocations when
 * CRON_SECRET is set as a project env var (see vercel.json's crons array)
 * — this is the only thing standing between a real job route (a normal,
 * publicly reachable API route) and anyone who requests its path directly.
 *
 * Returns a 401 response to send back if the check fails, or null if the
 * caller should proceed.
 */
export function verifyCronSecret(request: Request, routeName: string): NextResponse | null {
  const { CRON_SECRET } = getServerEnv();
  if (!CRON_SECRET) {
    console.warn(`CRON_SECRET is not configured — ${routeName} is unauthenticated.`);
    return null;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}
