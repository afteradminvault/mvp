import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/api/_lib/verify-cron-secret";
import { createSupabaseServiceRoleClient } from "@/infrastructure/supabase/service-role-client";
import { detectAndMarkOverdueEstates } from "@/infrastructure/dead-mans-switch/detect-overdue-estates";

/**
 * The dead-man's-switch check-in-overdue sweep (Security Architecture
 * §4.1's active_living -> checkin_overdue transition), run daily as a
 * Vercel Cron job. Schedule lives in vercel.json.
 */
export async function GET(request: Request) {
  const unauthorized = verifyCronSecret(request, "/api/cron/check-in-overdue");
  if (unauthorized) return unauthorized;

  const supabase = createSupabaseServiceRoleClient();
  const overdueEstates = await detectAndMarkOverdueEstates(supabase);

  console.log(`[cron-check-in-overdue] checkin_overdue: ${overdueEstates.length}`);

  return NextResponse.json({ ok: true, checkinOverdueCount: overdueEstates.length });
}
