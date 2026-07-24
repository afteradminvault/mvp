import { NextResponse } from "next/server";
import { DeathVerificationService } from "@/domain/death-verification/death-verification-service";
import { SupabaseDeathVerificationRepository } from "@/infrastructure/death-verification/supabase-death-verification-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { deathVerificationErrorResponse } from "@/app/api/_lib/death-verification-error-response";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * The Planner confirming they're alive while their estate is being
 * verified (Security Architecture §4.2). Transition, ownership/status
 * guard, and the self_cancel_used audit event all happen atomically inside
 * self_cancel() — same reasoning as report-death for keeping this in the
 * database function rather than the app layer.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new DeathVerificationService(new SupabaseDeathVerificationRepository(session.supabase));
  try {
    const estate = await service.selfCancel(id);
    return NextResponse.json({ estate });
  } catch (error) {
    return deathVerificationErrorResponse(error);
  }
}
