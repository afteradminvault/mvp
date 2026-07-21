import { NextResponse } from "next/server";
import { MembershipService } from "@/domain/membership/membership-service";
import type { InvitableRole } from "@/domain/membership/ports";
import { SupabaseMembershipRepository } from "@/infrastructure/membership/supabase-membership-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { membershipErrorResponse } from "@/app/api/_lib/membership-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Creates the pending invite and its token only — no email is sent here.
 * The Resend transactional template (Milestone 1 feature 6) is a separate,
 * later feature per the roadmap; the response includes a shareable link
 * for the Owner to send manually in the meantime.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { inviteEmail, role, fallbackOrder } = body as Record<string, unknown>;
  if (typeof inviteEmail !== "string") {
    return NextResponse.json({ error: "inviteEmail is a required string." }, { status: 400 });
  }
  if (typeof role !== "string") {
    return NextResponse.json({ error: "role is a required string." }, { status: 400 });
  }
  if (fallbackOrder !== undefined && typeof fallbackOrder !== "number") {
    return NextResponse.json({ error: "fallbackOrder must be a number if provided." }, { status: 400 });
  }

  const service = new MembershipService(new SupabaseMembershipRepository(session.supabase));
  try {
    const member = await service.inviteMember(id, {
      inviteEmail,
      role: role as InvitableRole,
      fallbackOrder: fallbackOrder as number | undefined,
    });
    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "member_invited",
      targetTable: "estate_members",
      targetId: member.id,
    });
    const inviteUrl = new URL(`/invites/${member.inviteToken}`, request.url).toString();
    return NextResponse.json({ member, inviteUrl }, { status: 201 });
  } catch (error) {
    return membershipErrorResponse(error);
  }
}
