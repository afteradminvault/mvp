import { NextResponse } from "next/server";
import { VaultPreviewLetterService } from "@/domain/vault-preview-letters/vault-preview-letter-service";
import { SupabaseVaultPreviewLetterRepository } from "@/infrastructure/vault-preview-letters/supabase-vault-preview-letter-repository";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { SupabaseVaultItemRepository } from "@/infrastructure/vault-items/supabase-vault-item-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { vaultPreviewLetterErrorResponse } from "@/app/api/_lib/vault-preview-letter-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string }> };

/** US-3.6 🔒 — every previously-generated letter for this Case (counts only, safe for any accepted member to see). */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new VaultPreviewLetterService(
    new SupabaseVaultPreviewLetterRepository(session.supabase),
    new SupabaseDigitalAssetRepository(session.supabase),
    new SupabaseVaultItemRepository(session.supabase),
  );
  try {
    const letters = await service.listLetters(id);
    return NextResponse.json({ letters });
  } catch (error) {
    return vaultPreviewLetterErrorResponse(error);
  }
}

/**
 * US-3.6 🔒 — generates a new letter from the *current* vault contents
 * (item_type_summary is a snapshot, not a live view — see the migration's
 * own comment). item_type_summary is computed by reading through the
 * existing asset/vault-item repositories, so it's automatically bounded
 * by whatever the caller's own session can actually see.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new VaultPreviewLetterService(
    new SupabaseVaultPreviewLetterRepository(session.supabase),
    new SupabaseDigitalAssetRepository(session.supabase),
    new SupabaseVaultItemRepository(session.supabase),
  );
  try {
    const letter = await service.generateLetter(id, session.userId);
    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "vault_preview_letter_generated",
      targetTable: "vault_preview_letters",
      targetId: letter.id,
    });
    return NextResponse.json({ letter }, { status: 201 });
  } catch (error) {
    return vaultPreviewLetterErrorResponse(error);
  }
}
