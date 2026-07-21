import { NextResponse } from "next/server";
import { MembershipService } from "@/domain/membership/membership-service";
import type { InvitableRole } from "@/domain/membership/ports";
import { SupabaseMembershipRepository } from "@/infrastructure/membership/supabase-membership-repository";
import { EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { ResendEmailSender } from "@/infrastructure/email/resend-email-sender";
import { getServerEnv } from "@/config/env";
import { requireSession } from "@/app/api/_lib/require-session";
import { membershipErrorResponse } from "@/app/api/_lib/membership-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Creates the pending invite, sends the real nomination-invite email
 * (Milestone 1 feature 6, replacing the never-actually-built Milestone 0
 * placeholder — Resend was blocked/deferred from the start, not swapped
 * out here), and always includes the shareable link in the response too —
 * email delivery is best-effort (src/infrastructure/email/resend-email-sender.ts)
 * and must never be the only way the Owner can get this link to the invitee.
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

  const membershipService = new MembershipService(new SupabaseMembershipRepository(session.supabase));
  try {
    const member = await membershipService.inviteMember(id, {
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

    const estateService = new EstateService(new SupabaseEstateRepository(session.supabase));
    const estate = await estateService.getEstate(id);
    const serverEnv = getServerEnv();
    const emailSender = new ResendEmailSender(serverEnv.RESEND_API_KEY, serverEnv.RESEND_FROM_EMAIL);
    const emailSent = await emailSender.sendNominationInviteEmail({
      toEmail: member.inviteEmail,
      estateDisplayName: estate.displayName,
      role: member.role as InvitableRole,
      inviteUrl,
    });

    return NextResponse.json({ member, inviteUrl, emailSent }, { status: 201 });
  } catch (error) {
    return membershipErrorResponse(error);
  }
}
