import { NextResponse } from "next/server";
import { ExecutorVerificationService } from "@/domain/executor-verification/executor-verification-service";
import { SupabaseExecutorVerificationRepository } from "@/infrastructure/executor-verification/supabase-executor-verification-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { executorVerificationErrorResponse } from "@/app/api/_lib/executor-verification-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string; memberId: string }> };

/**
 * US-4.4 🔒 — a Family member approves or declines a nominated Executor.
 * Declining is not a silent dead end: it sets status to 'declined' (see
 * the migration's own comment) rather than leaving the record untouched,
 * and — unlike revoke_member() — doesn't remove the executor from the
 * case, so Family can decide again later.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id, memberId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).approved !== "boolean") {
    return NextResponse.json({ error: "approved is a required boolean." }, { status: 400 });
  }
  const { approved } = body as { approved: boolean };

  const service = new ExecutorVerificationService(new SupabaseExecutorVerificationRepository(session.supabase));
  try {
    const verification = await service.decide(id, memberId, approved);
    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: approved ? "executor_verification_approved" : "executor_verification_declined",
      targetTable: "executor_verifications",
      targetId: verification.id,
    });
    return NextResponse.json({ verification });
  } catch (error) {
    return executorVerificationErrorResponse(error);
  }
}
