import { NextResponse } from "next/server";
import { ReadinessService } from "@/domain/readiness/readiness-service";
import { SupabaseReadinessRepository } from "@/infrastructure/readiness/supabase-readiness-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { readinessErrorResponse } from "@/app/api/_lib/readiness-error-response";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * API Specification §2, PRD §4.1. Read-only aggregate over what Milestone
 * 1 features 2–5 already built — no new writes, no new RLS surface.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new ReadinessService(new SupabaseReadinessRepository(session.supabase));
  try {
    const readinessScore = await service.getReadinessScore(id);
    return NextResponse.json({ readinessScore });
  } catch (error) {
    return readinessErrorResponse(error);
  }
}
