import { NextResponse } from "next/server";
import { AdminCaseService } from "@/domain/admin-cases/admin-case-service";
import { SupabaseAdminCaseRepository } from "@/infrastructure/admin-cases/supabase-admin-case-repository";
import { requirePlatformAdmin } from "@/app/api/_lib/require-platform-admin";
import { adminErrorResponse } from "@/app/api/_lib/admin-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string }> };

/** US-8.3 — flags or clears a Case for admin oversight, with an optional note. */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requirePlatformAdmin();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { flagged, flaggedNotes } = body as Record<string, unknown>;

  const service = new AdminCaseService(new SupabaseAdminCaseRepository(session.supabase));
  try {
    const adminCase = await service.flagCase(id, { flagged, flaggedNotes });
    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: adminCase.flagged ? "admin_case_flagged" : "admin_case_unflagged",
      targetTable: "cases",
      targetId: id,
    });
    return NextResponse.json({ case: adminCase });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
