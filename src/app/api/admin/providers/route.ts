import { NextResponse } from "next/server";
import { AdminProviderService } from "@/domain/admin-providers/admin-provider-service";
import type { AssetCategory } from "@/domain/assets/ports";
import { SupabaseAdminProviderRepository } from "@/infrastructure/admin-providers/supabase-admin-provider-repository";
import { requirePlatformAdmin } from "@/app/api/_lib/require-platform-admin";
import { adminErrorResponse } from "@/app/api/_lib/admin-error-response";

export async function GET() {
  const session = await requirePlatformAdmin();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new AdminProviderService(new SupabaseAdminProviderRepository(session.supabase));
  try {
    const providers = await service.listProviders();
    return NextResponse.json({ providers });
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

  const { name, defaultCategory, websiteUrl, notes } = body as Record<string, unknown>;
  if (typeof name !== "string" || typeof defaultCategory !== "string") {
    return NextResponse.json({ error: "name and defaultCategory are required strings." }, { status: 400 });
  }
  if (websiteUrl !== undefined && websiteUrl !== null && typeof websiteUrl !== "string") {
    return NextResponse.json({ error: "websiteUrl must be a string if provided." }, { status: 400 });
  }
  if (notes !== undefined && notes !== null && typeof notes !== "string") {
    return NextResponse.json({ error: "notes must be a string if provided." }, { status: 400 });
  }

  const service = new AdminProviderService(new SupabaseAdminProviderRepository(session.supabase));
  try {
    const provider = await service.createProvider({
      name,
      defaultCategory: defaultCategory as AssetCategory,
      websiteUrl: websiteUrl as string | null | undefined,
      notes: notes as string | null | undefined,
    });
    return NextResponse.json({ provider }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
