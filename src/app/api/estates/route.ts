import { NextResponse } from "next/server";
import { EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { estateErrorResponse } from "@/app/api/_lib/estate-error-response";

export async function GET() {
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new EstateService(new SupabaseEstateRepository(session.supabase));
  try {
    const estates = await service.listMyEstates();
    return NextResponse.json({ estates });
  } catch (error) {
    return estateErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { displayName, jurisdictionId, checkInIntervalDays } = body as Record<string, unknown>;
  if (typeof displayName !== "string" || typeof jurisdictionId !== "string") {
    return NextResponse.json(
      { error: "displayName and jurisdictionId are required strings." },
      { status: 400 },
    );
  }
  if (checkInIntervalDays !== undefined && typeof checkInIntervalDays !== "number") {
    return NextResponse.json(
      { error: "checkInIntervalDays must be a number if provided." },
      { status: 400 },
    );
  }

  const service = new EstateService(new SupabaseEstateRepository(session.supabase));
  try {
    const estate = await service.createEstate({ displayName, jurisdictionId, checkInIntervalDays });
    return NextResponse.json({ estate }, { status: 201 });
  } catch (error) {
    return estateErrorResponse(error);
  }
}
