import { NextResponse } from "next/server";
import { PlatformService } from "@/domain/platforms/platform-service";
import { SupabasePlatformRepository } from "@/infrastructure/platforms/supabase-platform-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { platformErrorResponse } from "@/app/api/_lib/platform-error-response";

/**
 * With no query params: the curated common subset for the onboarding
 * checklist (US-2.4) — unchanged behavior, so that consumer never breaks.
 * With ?search= and/or ?category=: US-5.1's full-catalog search/browse —
 * a superset capability added to the same endpoint (the "expand in place"
 * pattern already used for the platform-catalog fields themselves).
 * Session-gated per API Specification §8's pattern for reference-data reads.
 */
export async function GET(request: Request) {
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const category = searchParams.get("category");

  const service = new PlatformService(new SupabasePlatformRepository(session.supabase));
  try {
    const platforms =
      search !== null || category !== null
        ? await service.searchPlatforms({ search: search ?? undefined, category: category ?? undefined })
        : await service.listCommonOnboardingPlatforms();
    return NextResponse.json({ platforms });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
