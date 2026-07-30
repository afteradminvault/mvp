import { NextResponse } from "next/server";
import { AdminCaseService } from "@/domain/admin-cases/admin-case-service";
import { SupabaseAdminCaseRepository } from "@/infrastructure/admin-cases/supabase-admin-case-repository";
import { requirePlatformAdmin } from "@/app/api/_lib/require-platform-admin";
import { adminErrorResponse } from "@/app/api/_lib/admin-error-response";

/** US-8.3 — cases_select_admin RLS scopes this to platform admins; ?flagged=true filters to the dedicated flagged view. */
export async function GET(request: Request) {
  const session = await requirePlatformAdmin();
  if ("unauthorized" in session) return session.unauthorized;

  const { searchParams } = new URL(request.url);
  const service = new AdminCaseService(new SupabaseAdminCaseRepository(session.supabase));
  try {
    const result = await service.listCases({
      flaggedOnly: searchParams.get("flagged") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
