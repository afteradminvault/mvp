import { NextResponse } from "next/server";
import { VaultKeyService } from "@/domain/vault-key/vault-key-service";
import { SupabaseVaultKeyRepository } from "@/infrastructure/vault-key/supabase-vault-key-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { vaultKeyErrorResponse } from "@/app/api/_lib/vault-key-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * 🔒 Vault-key bootstrap (docs/SECURITY_ARCHITECTURE.md §1.1, Milestone 1
 * feature 4). Neither method ever receives or returns plaintext key
 * material — only opaque hex-encoded ciphertext (wrappedVaultKey) and a
 * KDF salt (not secret, but account-scoped). Request bodies are
 * destructured to exactly the fields stored; nothing here logs a body.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new VaultKeyService(new SupabaseVaultKeyRepository(session.supabase));
  try {
    const state = await service.getOwnerVaultKeyState(id);
    return NextResponse.json({ vaultKey: state });
  } catch (error) {
    return vaultKeyErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { wrappedVaultKey, kdfSalt } = body as Record<string, unknown>;
  if (typeof wrappedVaultKey !== "string") {
    return NextResponse.json({ error: "wrappedVaultKey is a required string." }, { status: 400 });
  }
  if (kdfSalt !== undefined && typeof kdfSalt !== "string") {
    return NextResponse.json({ error: "kdfSalt must be a string if provided." }, { status: 400 });
  }

  const service = new VaultKeyService(new SupabaseVaultKeyRepository(session.supabase));
  try {
    const state = await service.initializeOwnerVaultKey(id, { wrappedVaultKey, kdfSalt });
    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "vault_key_initialized",
    });
    return NextResponse.json({ vaultKey: state }, { status: 201 });
  } catch (error) {
    return vaultKeyErrorResponse(error);
  }
}
