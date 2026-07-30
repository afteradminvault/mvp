import { NextResponse } from "next/server";
import { PlatformService } from "@/domain/platforms/platform-service";
import { SupabasePlatformRepository } from "@/infrastructure/platforms/supabase-platform-repository";
import { requireSession } from "@/app/api/_lib/require-session";

/** Curated common subset for the onboarding checklist (US-2.4) — Session-gated per API Specification §8's pattern for reference-data reads. */
export async function GET() {
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new PlatformService(new SupabasePlatformRepository(session.supabase));
  try {
    const platforms = await service.listCommonOnboardingPlatforms();
    return NextResponse.json({ platforms });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
