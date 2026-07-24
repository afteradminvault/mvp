import { NextResponse } from "next/server";
import { DeathVerificationService } from "@/domain/death-verification/death-verification-service";
import { SupabaseDeathVerificationRepository } from "@/infrastructure/death-verification/supabase-death-verification-repository";
import { ResendEmailSender } from "@/infrastructure/email/resend-email-sender";
import { getServerEnv } from "@/config/env";
import { requireSession } from "@/app/api/_lib/require-session";
import { deathVerificationErrorResponse } from "@/app/api/_lib/death-verification-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Proactive death report by a nominated executor/helper (Security
 * Architecture §4.1/§4.2 — restricted to accepted executor/helper members,
 * enforced inside report_death() itself). The status transition, its
 * authorization check, and the death_reported audit event all happen
 * atomically inside that one RPC (see
 * supabase/migrations/20260723000200_death_verification_functions.sql) —
 * deliberately not app-layer audit logging like the invite_member
 * precedent, since this is the false-positive-sensitive workflow and the
 * transition + its audit record must never be separable by a crash/timeout
 * between two calls.
 *
 * The notice email necessarily happens here, after the transition commits
 * — its outcome can't be known inside the RPC — logged as a separate
 * verification_notice_sent event via the caller's own session client.
 * Best-effort: a failed/unconfigured send doesn't fail the report itself,
 * matching every other EmailSender call site in this codebase.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new DeathVerificationService(new SupabaseDeathVerificationRepository(session.supabase));
  try {
    const estate = await service.reportDeath(id);
    const ownerEmail = await service.getOwnerEmail(id);

    const serverEnv = getServerEnv();
    const emailSender = new ResendEmailSender(serverEnv.RESEND_API_KEY, serverEnv.RESEND_FROM_EMAIL);
    const selfCancelUrl = new URL(`/estates/${id}`, request.url).toString();
    const emailSent = await emailSender.sendDeathVerificationNoticeEmail({
      toEmail: ownerEmail,
      estateDisplayName: estate.displayName,
      selfCancelWindowDays: estate.selfCancelWindowDays,
      selfCancelUrl,
    });

    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "verification_notice_sent",
      targetTable: "estates",
      targetId: id,
      metadata: { channel: "email", success: emailSent },
    });

    return NextResponse.json({ estate, emailSent });
  } catch (error) {
    return deathVerificationErrorResponse(error);
  }
}
