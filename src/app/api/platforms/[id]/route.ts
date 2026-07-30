import { NextResponse } from "next/server";
import { PlatformService } from "@/domain/platforms/platform-service";
import { SupabasePlatformRepository } from "@/infrastructure/platforms/supabase-platform-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { platformErrorResponse } from "@/app/api/_lib/platform-error-response";

type RouteParams = { params: Promise<{ id: string }> };

/** US-5.2 — a single platform's closure instructions, closure method, and bereavement contact info. */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new PlatformService(new SupabasePlatformRepository(session.supabase));
  try {
    const platform = await service.getPlatform(id);
    return NextResponse.json({ platform });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
