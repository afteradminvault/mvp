import { NextResponse } from "next/server";
import { getServerEnv } from "@/config/env";

/**
 * Migrated from the Netlify Scheduled Function placeholder (Milestone 0)
 * when hosting switched from Netlify to Vercel — same purpose, prove the
 * background-job pattern works before Milestone 2's real dead-man's-switch
 * and reminder jobs are built on top of it. Schedule lives in vercel.json.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on cron invocations
 * when CRON_SECRET is set as a project env var. Verified here so this
 * endpoint (a real route, reachable by anyone who knows the path) can't be
 * triggered by an arbitrary caller once real job logic replaces this.
 */
export async function GET(request: Request) {
  const { CRON_SECRET } = getServerEnv();
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  } else {
    console.warn("CRON_SECRET is not configured — /api/cron/placeholder is unauthenticated.");
  }

  console.log(`[cron-placeholder] invoked at ${new Date().toISOString()}`);
  return NextResponse.json({ ok: true });
}
