import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/api/_lib/verify-cron-secret";
import { createSupabaseServiceRoleClient } from "@/infrastructure/supabase/service-role-client";
import { SupabaseClosureRequestRepository } from "@/infrastructure/closure-requests/supabase-closure-request-repository";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { SupabaseMembershipRepository } from "@/infrastructure/membership/supabase-membership-repository";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { ResendEmailSender } from "@/infrastructure/email/resend-email-sender";
import { StaleClosureRequestNudgeService } from "@/domain/closure-requests/stale-request-nudge-service";
import { clientEnv, getServerEnv } from "@/config/env";

/**
 * Stale-request nudges (Milestone 2 feature 8, PRD §5) — replaces the
 * Milestone 0 placeholder job that proved the Scheduled-Function-turned-
 * Vercel-Cron pattern (see docs/DEVELOPMENT_ROADMAP.md's Milestone 0 step
 * 2 and TECH_STACK.md's Hosting section). This is the second and last cron
 * job the Vercel Hobby plan's 2-job cap allows — check-in-overdue already
 * took the first slot for the dead-man's-switch sweep — so this route,
 * not a third one, is where real reminder logic lands.
 *
 * baseUrl comes from NEXT_PUBLIC_SITE_URL rather than request.url:
 * a Cron invocation's request doesn't necessarily reflect the project's
 * canonical public domain the way a real user's browser request does.
 */
export async function GET(request: Request) {
  const unauthorized = verifyCronSecret(request, "/api/cron/closure-request-stale-nudges");
  if (unauthorized) return unauthorized;

  const supabase = createSupabaseServiceRoleClient();
  const serverEnv = getServerEnv();
  const service = new StaleClosureRequestNudgeService(
    new SupabaseClosureRequestRepository(supabase),
    new SupabaseEstateRepository(supabase),
    new SupabaseMembershipRepository(supabase),
    new SupabaseDigitalAssetRepository(supabase),
    new ResendEmailSender(serverEnv.RESEND_API_KEY, serverEnv.RESEND_FROM_EMAIL),
  );

  const { staleRequestCount, emailsSent } = await service.sendNudges(clientEnv.NEXT_PUBLIC_SITE_URL);

  console.log(`[cron-closure-request-stale-nudges] stale: ${staleRequestCount}, emails sent: ${emailsSent}`);

  return NextResponse.json({ ok: true, staleRequestCount, emailsSent });
}
