import { NextResponse } from "next/server";
import { AdminProviderService } from "@/domain/admin-providers/admin-provider-service";
import type { AssetCategory } from "@/domain/assets/ports";
import { SupabaseAdminProviderRepository } from "@/infrastructure/admin-providers/supabase-admin-provider-repository";
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

  const {
    name,
    defaultCategory,
    websiteUrl,
    notes,
    closureMethod,
    closureInstructions,
    bereavementContactEmail,
    bereavementContactPhone,
    bereavementInstructionsUrl,
    logoUrl,
    isCommonOnboardingPlatform,
    supportsMemorialize,
    isActive,
  } = body as Record<string, unknown>;
  if (name !== undefined && typeof name !== "string") {
    return NextResponse.json({ error: "name must be a string if provided." }, { status: 400 });
  }
  if (defaultCategory !== undefined && typeof defaultCategory !== "string") {
    return NextResponse.json({ error: "defaultCategory must be a string if provided." }, { status: 400 });
  }
  if (websiteUrl !== undefined && websiteUrl !== null && typeof websiteUrl !== "string") {
    return NextResponse.json({ error: "websiteUrl must be a string if provided." }, { status: 400 });
  }
  if (notes !== undefined && notes !== null && typeof notes !== "string") {
    return NextResponse.json({ error: "notes must be a string if provided." }, { status: 400 });
  }
  if (closureMethod !== undefined && closureMethod !== null && typeof closureMethod !== "string") {
    return NextResponse.json({ error: "closureMethod must be a string if provided." }, { status: 400 });
  }
  if (closureInstructions !== undefined && closureInstructions !== null && typeof closureInstructions !== "string") {
    return NextResponse.json({ error: "closureInstructions must be a string if provided." }, { status: 400 });
  }
  if (
    bereavementContactEmail !== undefined &&
    bereavementContactEmail !== null &&
    typeof bereavementContactEmail !== "string"
  ) {
    return NextResponse.json({ error: "bereavementContactEmail must be a string if provided." }, { status: 400 });
  }
  if (
    bereavementContactPhone !== undefined &&
    bereavementContactPhone !== null &&
    typeof bereavementContactPhone !== "string"
  ) {
    return NextResponse.json({ error: "bereavementContactPhone must be a string if provided." }, { status: 400 });
  }
  if (
    bereavementInstructionsUrl !== undefined &&
    bereavementInstructionsUrl !== null &&
    typeof bereavementInstructionsUrl !== "string"
  ) {
    return NextResponse.json({ error: "bereavementInstructionsUrl must be a string if provided." }, { status: 400 });
  }
  if (logoUrl !== undefined && logoUrl !== null && typeof logoUrl !== "string") {
    return NextResponse.json({ error: "logoUrl must be a string if provided." }, { status: 400 });
  }
  if (isCommonOnboardingPlatform !== undefined && typeof isCommonOnboardingPlatform !== "boolean") {
    return NextResponse.json({ error: "isCommonOnboardingPlatform must be a boolean if provided." }, { status: 400 });
  }
  if (supportsMemorialize !== undefined && typeof supportsMemorialize !== "boolean") {
    return NextResponse.json({ error: "supportsMemorialize must be a boolean if provided." }, { status: 400 });
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    return NextResponse.json({ error: "isActive must be a boolean if provided." }, { status: 400 });
  }

  const service = new AdminProviderService(new SupabaseAdminProviderRepository(session.supabase));
  try {
    const provider = await service.updateProvider(id, {
      name,
      defaultCategory: defaultCategory as AssetCategory | undefined,
      websiteUrl: websiteUrl as string | null | undefined,
      notes: notes as string | null | undefined,
      closureMethod: closureMethod as never,
      closureInstructions: closureInstructions as string | null | undefined,
      bereavementContactEmail: bereavementContactEmail as string | null | undefined,
      bereavementContactPhone: bereavementContactPhone as string | null | undefined,
      bereavementInstructionsUrl: bereavementInstructionsUrl as string | null | undefined,
      logoUrl: logoUrl as string | null | undefined,
      isCommonOnboardingPlatform: isCommonOnboardingPlatform as boolean | undefined,
      supportsMemorialize: supportsMemorialize as boolean | undefined,
      isActive: isActive as boolean | undefined,
    });
    return NextResponse.json({ provider });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
