import { NextResponse } from "next/server";
import { VaultItemService } from "@/domain/vault-items/vault-item-service";
import type { VaultItemType } from "@/domain/vault-items/ports";
import { SupabaseVaultItemRepository } from "@/infrastructure/vault-items/supabase-vault-item-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { vaultItemErrorResponse } from "@/app/api/_lib/vault-item-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string; assetId: string }> };

/**
 * 🔒 Vault items (Database Schema §4.2, API Specification §6). Ciphertext
 * in, ciphertext out — every body here is destructured to exactly
 * itemType/ciphertext/encryptionIv/wrappedDataKey/keyVersion, all opaque
 * hex strings this route never decodes. No response body or error is ever
 * logged; only the caught error object (never the request body) reaches
 * console.error, via vaultItemErrorResponse.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id, assetId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new VaultItemService(new SupabaseVaultItemRepository(session.supabase));
  try {
    const items = await service.listItems(assetId);
    // Recorded regardless of how many items came back — this is the only
    // thing the server can attest to; it cannot know whether client-side
    // decryption subsequently succeeds (Security Architecture §3.3).
    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "vault_items_viewed",
      targetTable: "digital_assets",
      targetId: assetId,
    });
    return NextResponse.json({ items });
  } catch (error) {
    return vaultItemErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id, assetId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { itemType, ciphertext, encryptionIv, wrappedDataKey, keyVersion } = body as Record<string, unknown>;
  if (typeof itemType !== "string") {
    return NextResponse.json({ error: "itemType is a required string." }, { status: 400 });
  }
  if (typeof ciphertext !== "string" || typeof encryptionIv !== "string" || typeof wrappedDataKey !== "string") {
    return NextResponse.json(
      { error: "ciphertext, encryptionIv, and wrappedDataKey are required strings." },
      { status: 400 },
    );
  }
  if (keyVersion !== undefined && typeof keyVersion !== "number") {
    return NextResponse.json({ error: "keyVersion must be a number if provided." }, { status: 400 });
  }

  const service = new VaultItemService(new SupabaseVaultItemRepository(session.supabase));
  try {
    const item = await service.createItem(assetId, {
      itemType: itemType as VaultItemType,
      ciphertext,
      encryptionIv,
      wrappedDataKey,
      keyVersion: keyVersion as number | undefined,
    });
    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "vault_item_created",
      targetTable: "digital_vault_items",
      targetId: item.id,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return vaultItemErrorResponse(error);
  }
}
