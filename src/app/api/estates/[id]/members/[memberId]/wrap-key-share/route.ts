import { NextResponse } from "next/server";
import { MembershipService } from "@/domain/membership/membership-service";
import { SupabaseMembershipRepository } from "@/infrastructure/membership/supabase-membership-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { membershipErrorResponse } from "@/app/api/_lib/membership-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string; memberId: string }> };

/**
 * The Owner's client has already sealed the estate's VK under this
 * member's public key (src/crypto/asymmetric.ts's sealForRecipient) —
 * this endpoint only stores the resulting opaque bytes. Server never
 * touches key material meaningfully, only stores/serves it (Security
 * Architecture §1.1).
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id, memberId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { sealedVaultKey } = body as Record<string, unknown>;
  if (typeof sealedVaultKey !== "string") {
    return NextResponse.json({ error: "sealedVaultKey is a required string." }, { status: 400 });
  }

  const service = new MembershipService(new SupabaseMembershipRepository(session.supabase));
  try {
    const member = await service.wrapKeyShareForMember(id, memberId, sealedVaultKey);
    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "member_key_share_wrapped",
      targetTable: "estate_members",
      targetId: memberId,
    });
    return NextResponse.json({ member });
  } catch (error) {
    return membershipErrorResponse(error);
  }
}
