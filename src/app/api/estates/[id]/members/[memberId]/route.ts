import { NextResponse } from "next/server";
import { MembershipService } from "@/domain/membership/membership-service";
import { SupabaseMembershipRepository } from "@/infrastructure/membership/supabase-membership-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { membershipErrorResponse } from "@/app/api/_lib/membership-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string; memberId: string }> };

/**
 * Revoke — sets invite_status = 'revoked', never deletes the row (audit
 * history). This does NOT and cannot retroactively invalidate a key share
 * already distributed and unwrapped client-side (API Specification §3's
 * documented limitation) — the UI must surface this, not imply revocation
 * is airtight.
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id, memberId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new MembershipService(new SupabaseMembershipRepository(session.supabase));
  try {
    const member = await service.revokeMember(id, memberId);
    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "member_revoked",
      targetTable: "case_members",
      targetId: memberId,
    });
    return NextResponse.json({ member });
  } catch (error) {
    return membershipErrorResponse(error);
  }
}
