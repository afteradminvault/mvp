import { NextResponse } from "next/server";
import { KeyRecoveryService } from "@/domain/key-recovery/key-recovery-service";
import { SupabaseKeyRecoveryRepository } from "@/infrastructure/key-recovery/supabase-key-recovery-repository";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { keyRecoveryErrorResponse } from "@/app/api/_lib/key-recovery-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * 🔒 Security Architecture §1.2 / API Specification §4 — "the single most
 * access-controlled read in the API." Only servable once
 * estates.status = 'active_executor' (KeyRecoveryService checks this
 * before ever querying estate_members/users) — an app-layer gate that is
 * real defense-in-depth, not the load-bearing control: the actual
 * ciphertext (digital_vault_items) is independently gated by
 * digital_vault_items_select_executor_post_death RLS regardless of this
 * route. Never receives or returns plaintext — only opaque hex-encoded
 * ciphertext/key material, same as vault-key/vault-items.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new KeyRecoveryService(
    new SupabaseEstateRepository(session.supabase),
    new SupabaseKeyRecoveryRepository(session.supabase),
  );
  try {
    const material = await service.getExecutorKeyRecoveryMaterial(id, session.userId);
    // Records that the read happened, not whether client-side unwrap
    // subsequently succeeds — the server can't know that, same principle
    // as vault_items_viewed (Security Architecture §3.3).
    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "key_recovery_used",
    });
    return NextResponse.json({ keyRecovery: material });
  } catch (error) {
    return keyRecoveryErrorResponse(error);
  }
}
