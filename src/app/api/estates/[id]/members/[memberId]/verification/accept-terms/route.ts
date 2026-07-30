import { NextResponse } from "next/server";
import { ExecutorVerificationService } from "@/domain/executor-verification/executor-verification-service";
import { SupabaseExecutorVerificationRepository } from "@/infrastructure/executor-verification/supabase-executor-verification-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { executorVerificationErrorResponse } from "@/app/api/_lib/executor-verification-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string; memberId: string }> };

/**
 * US-4.3 — records a timestamped legal-terms acceptance. Per the
 * spreadsheet's own implementation note ("the actual terms copy needs
 * separate counsel review"), this is the mechanism only — no terms body is
 * rendered/stored here.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const { id, memberId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new ExecutorVerificationService(new SupabaseExecutorVerificationRepository(session.supabase));
  try {
    const verification = await service.acceptLegalTerms(id, memberId);
    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "executor_legal_terms_accepted",
      targetTable: "executor_verifications",
      targetId: verification.id,
    });
    return NextResponse.json({ verification });
  } catch (error) {
    return executorVerificationErrorResponse(error);
  }
}
