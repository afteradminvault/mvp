import { NextResponse } from "next/server";
import { AdminWillExecutionRequirementService } from "@/domain/admin-will-execution-requirements/admin-will-execution-requirement-service";
import { SupabaseAdminWillExecutionRequirementRepository } from "@/infrastructure/admin-will-execution-requirements/supabase-admin-will-execution-requirement-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { adminErrorResponse } from "@/app/api/_lib/admin-error-response";

/** Read-only, non-admin — the wizard needs to show a jurisdiction's execution requirements before generating (will_execution_requirements_select_all RLS already permits any authenticated read). */
export async function GET(request: Request) {
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const { searchParams } = new URL(request.url);
  const jurisdictionId = searchParams.get("jurisdictionId") ?? undefined;

  const service = new AdminWillExecutionRequirementService(
    new SupabaseAdminWillExecutionRequirementRepository(session.supabase),
  );
  try {
    const requirements = await service.listRequirements({ jurisdictionId });
    return NextResponse.json({ requirements });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
