import { NextResponse } from "next/server";
import { VaultItemNotFoundError, VaultItemService } from "@/domain/vault-items/vault-item-service";
import { SupabaseVaultItemRepository } from "@/infrastructure/vault-items/supabase-vault-item-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { vaultItemErrorResponse } from "@/app/api/_lib/vault-item-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string; assetId: string; itemId: string }> };

/**
 * Verifying item.digitalAssetId === the URL's :assetId is the same
 * defense-in-depth/API-correctness check as the digital_assets routes —
 * RLS already prevents any real cross-estate/cross-asset access; this just
 * avoids a confusing response if the URL and row disagree.
 */
async function getItemScopedToAsset(service: VaultItemService, assetId: string, itemId: string) {
  const item = await service.getItem(itemId);
  if (item.digitalAssetId !== assetId) {
    throw new VaultItemNotFoundError("Vault item not found, or you don't have access to it.");
  }
  return item;
}

/**
 * No GET here — a single item is never fetched alone; the list endpoint
 * (../vault-items) is the only read path, matching API Specification §6.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id, assetId, itemId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { ciphertext, encryptionIv, wrappedDataKey } = body as Record<string, unknown>;
  if (typeof ciphertext !== "string" || typeof encryptionIv !== "string" || typeof wrappedDataKey !== "string") {
    return NextResponse.json(
      { error: "ciphertext, encryptionIv, and wrappedDataKey are required strings." },
      { status: 400 },
    );
  }

  const service = new VaultItemService(new SupabaseVaultItemRepository(session.supabase));
  try {
    await getItemScopedToAsset(service, assetId, itemId);
    const item = await service.rotateItem(itemId, { ciphertext, encryptionIv, wrappedDataKey });
    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "vault_item_rotated",
      targetTable: "digital_vault_items",
      targetId: item.id,
    });
    return NextResponse.json({ item });
  } catch (error) {
    return vaultItemErrorResponse(error);
  }
}

/** Real hard delete — no archived_at column on digital_vault_items (unlike digital_assets). */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id, assetId, itemId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new VaultItemService(new SupabaseVaultItemRepository(session.supabase));
  try {
    await getItemScopedToAsset(service, assetId, itemId);
    await service.deleteItem(itemId);
    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "vault_item_deleted",
      targetTable: "digital_vault_items",
      targetId: itemId,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return vaultItemErrorResponse(error);
  }
}
