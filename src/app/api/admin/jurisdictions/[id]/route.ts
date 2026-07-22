import { NextResponse } from "next/server";
import { AdminJurisdictionService } from "@/domain/admin-jurisdictions/admin-jurisdiction-service";
import { SupabaseAdminJurisdictionRepository } from "@/infrastructure/admin-jurisdictions/supabase-admin-jurisdiction-repository";
import { requirePlatformAdmin } from "@/app/api/_lib/require-platform-admin";
import { adminErrorResponse } from "@/app/api/_lib/admin-error-response";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requirePlatformAdmin();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { displayName, isSupported } = body as Record<string, unknown>;
  if (displayName !== undefined && typeof displayName !== "string") {
    return NextResponse.json({ error: "displayName must be a string if provided." }, { status: 400 });
  }
  if (isSupported !== undefined && typeof isSupported !== "boolean") {
    return NextResponse.json({ error: "isSupported must be a boolean if provided." }, { status: 400 });
  }

  const service = new AdminJurisdictionService(new SupabaseAdminJurisdictionRepository(session.supabase));
  try {
    const jurisdiction = await service.updateJurisdiction(id, { displayName, isSupported });
    return NextResponse.json({ jurisdiction });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
