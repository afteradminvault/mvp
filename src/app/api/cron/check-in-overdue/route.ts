import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/api/_lib/verify-cron-secret";
import { createSupabaseServiceRoleClient } from "@/infrastructure/supabase/service-role-client";
import { detectAndMarkOverdueEstates } from "@/infrastructure/dead-mans-switch/detect-overdue-estates";
import { escalateOverdueToVerifying } from "@/infrastructure/dead-mans-switch/escalate-overdue-to-verifying";
import { escalateLapsedVerifications } from "@/infrastructure/dead-mans-switch/escalate-lapsed-verifications";

/**
 * The full dead-man's-switch / death-verification sweep (Security
 * Architecture §4.1), run daily as one Vercel Cron job rather than three —
 * the Vercel Hobby plan caps a project at 2 cron jobs, and this is already
 * the second alongside /api/cron/placeholder, so a third route for each
 * new sweep isn't an option without a plan upgrade. All three sweeps are
 * independent (each keyed off a different estates.status), so bundling
 * them into one daily invocation costs nothing behaviorally.
 *
 * Order doesn't matter for correctness (each sweep only touches estates in
 * its own starting status), but running detection before the escalations
 * means a freshly-overdue estate can't also lapse its (not-yet-started)
 * verification window in the same run.
 */
export async function GET(request: Request) {
  const unauthorized = verifyCronSecret(request, "/api/cron/check-in-overdue");
  if (unauthorized) return unauthorized;

  const supabase = createSupabaseServiceRoleClient();

  const overdueEstates = await detectAndMarkOverdueEstates(supabase);
  const escalatedToVerifying = await escalateOverdueToVerifying(supabase);
  const lapsedVerifications = await escalateLapsedVerifications(supabase);

  console.log(
    `[cron-check-in-overdue] checkin_overdue: ${overdueEstates.length}, ` +
      `checkin_overdue->verifying: ${escalatedToVerifying.length}, ` +
      `verifying->awaiting_death_certificate: ${lapsedVerifications.length}`,
  );

  return NextResponse.json({
    ok: true,
    checkinOverdueCount: overdueEstates.length,
    escalatedToVerifyingCount: escalatedToVerifying.length,
    lapsedVerificationsCount: lapsedVerifications.length,
  });
}
