import { NextResponse } from "next/server";
import { EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { estateErrorResponse } from "@/app/api/_lib/estate-error-response";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new EstateService(new SupabaseEstateRepository(session.supabase));
  try {
    const estate = await service.getEstate(id);
    return NextResponse.json({ estate });
  } catch (error) {
    return estateErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { displayName, checkInIntervalDays, gracePeriodDays } = body as Record<string, unknown>;
  if (displayName !== undefined && typeof displayName !== "string") {
    return NextResponse.json({ error: "displayName must be a string." }, { status: 400 });
  }
  if (checkInIntervalDays !== undefined && typeof checkInIntervalDays !== "number") {
    return NextResponse.json({ error: "checkInIntervalDays must be a number." }, { status: 400 });
  }
  if (gracePeriodDays !== undefined && typeof gracePeriodDays !== "number") {
    return NextResponse.json({ error: "gracePeriodDays must be a number." }, { status: 400 });
  }

  const service = new EstateService(new SupabaseEstateRepository(session.supabase));
  try {
    const estate = await service.updateEstate(id, { displayName, checkInIntervalDays, gracePeriodDays });
    return NextResponse.json({ estate });
  } catch (error) {
    return estateErrorResponse(error);
  }
}
