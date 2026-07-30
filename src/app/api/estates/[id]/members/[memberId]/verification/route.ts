import { NextResponse } from "next/server";
import { ExecutorVerificationService } from "@/domain/executor-verification/executor-verification-service";
import { SupabaseExecutorVerificationRepository } from "@/infrastructure/executor-verification/supabase-executor-verification-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { executorVerificationErrorResponse } from "@/app/api/_lib/executor-verification-error-response";

type RouteParams = { params: Promise<{ id: string; memberId: string }> };

/** US-4.5 — plain-language verification status, visible to the executor themselves and any family-role member. */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id, memberId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new ExecutorVerificationService(new SupabaseExecutorVerificationRepository(session.supabase));
  try {
    const verification = await service.getVerification(id, memberId);
    return NextResponse.json({ verification });
  } catch (error) {
    return executorVerificationErrorResponse(error);
  }
}
