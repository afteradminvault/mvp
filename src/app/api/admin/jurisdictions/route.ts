import { NextResponse } from "next/server";
import { AdminJurisdictionService } from "@/domain/admin-jurisdictions/admin-jurisdiction-service";
import { SupabaseAdminJurisdictionRepository } from "@/infrastructure/admin-jurisdictions/supabase-admin-jurisdiction-repository";
import { requirePlatformAdmin } from "@/app/api/_lib/require-platform-admin";
import { adminErrorResponse } from "@/app/api/_lib/admin-error-response";

export async function GET() {
  const session = await requirePlatformAdmin();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new AdminJurisdictionService(new SupabaseAdminJurisdictionRepository(session.supabase));
  try {
    const jurisdictions = await service.listJurisdictions();
    return NextResponse.json({ jurisdictions });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const session = await requirePlatformAdmin();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { countryCode, regionCode, displayName, isSupported } = body as Record<string, unknown>;
  if (typeof countryCode !== "string" || typeof displayName !== "string") {
    return NextResponse.json({ error: "countryCode and displayName are required strings." }, { status: 400 });
  }
  if (regionCode !== undefined && regionCode !== null && typeof regionCode !== "string") {
    return NextResponse.json({ error: "regionCode must be a string if provided." }, { status: 400 });
  }
  if (isSupported !== undefined && typeof isSupported !== "boolean") {
    return NextResponse.json({ error: "isSupported must be a boolean if provided." }, { status: 400 });
  }

  const service = new AdminJurisdictionService(new SupabaseAdminJurisdictionRepository(session.supabase));
  try {
    const jurisdiction = await service.createJurisdiction({
      countryCode,
      regionCode: regionCode as string | null | undefined,
      displayName,
      isSupported: isSupported as boolean | undefined,
    });
    return NextResponse.json({ jurisdiction }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
