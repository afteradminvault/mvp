import { NextResponse } from "next/server";
import { EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { ResendEmailSender } from "@/infrastructure/email/resend-email-sender";
import { getServerEnv } from "@/config/env";
import { requireSession } from "@/app/api/_lib/require-session";
import { estateErrorResponse } from "@/app/api/_lib/estate-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Completes onboarding — the only path from 'draft' to 'active_living'
 * (activate_draft_case()). The transition and its case_onboarding_completed
 * audit event happen atomically inside that RPC, same rationale as
 * report_death() (src/app/api/estates/[id]/report-death/route.ts) — not
 * re-logged here.
 *
 * The confirmation email (US-2.5, PRD v2 §3.2/§6) necessarily happens
 * here, after the transition commits — same "can't know the outcome
 * inside the RPC" reasoning as report_death()'s own notice email — logged
 * as a separate case_setup_confirmation_sent event via the caller's own
 * session client. The recipient is the caller themselves: only the case
 * owner can reach this route (activate_draft_case() enforces that), so
 * there's no separate "look up the owner's email" step needed the way
 * report_death()'s notice email requires (that one notifies someone other
 * than the caller).
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new EstateService(new SupabaseEstateRepository(session.supabase));
  try {
    const estate = await service.activateDraftCase(id);

    const {
      data: { user },
    } = await session.supabase.auth.getUser();

    let emailSent = false;
    if (user?.email) {
      const serverEnv = getServerEnv();
      const emailSender = new ResendEmailSender(serverEnv.RESEND_API_KEY, serverEnv.RESEND_FROM_EMAIL);
      const caseUrl = new URL(`/estates/${id}`, request.url).toString();
      emailSent = await emailSender.sendCaseSetupConfirmationEmail({
        toEmail: user.email,
        caseDisplayName: estate.displayName,
        caseUrl,
      });
    }

    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "case_setup_confirmation_sent",
      targetTable: "cases",
      targetId: id,
      metadata: { channel: "email", success: emailSent },
    });

    return NextResponse.json({ case: estate, emailSent });
  } catch (error) {
    return estateErrorResponse(error);
  }
}
