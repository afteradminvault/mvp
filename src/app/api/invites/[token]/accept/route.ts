import { NextResponse } from "next/server";
import { MembershipService } from "@/domain/membership/membership-service";
import { SupabaseMembershipRepository } from "@/infrastructure/membership/supabase-membership-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { membershipErrorResponse } from "@/app/api/_lib/membership-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ token: string }> };

/**
 * "Public → Session on completion" (API Specification §3): the invitee
 * signs up or logs in first (ordinary auth, unrelated to this route) —
 * by the time this is called, a session must already exist. Body carries
 * only opaque, client-generated key material (publicKey, wrappedPrivateKey,
 * kdfSalt) — never a plaintext private key.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { token } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { publicKey, wrappedPrivateKey, kdfSalt } = body as Record<string, unknown>;
  if (typeof publicKey !== "string" || typeof wrappedPrivateKey !== "string" || typeof kdfSalt !== "string") {
    return NextResponse.json(
      { error: "publicKey, wrappedPrivateKey, and kdfSalt are required strings." },
      { status: 400 },
    );
  }

  const service = new MembershipService(new SupabaseMembershipRepository(session.supabase));
  try {
    const member = await service.acceptInvite(token, { publicKey, wrappedPrivateKey, kdfSalt });
    await writeAuditLog(session.supabase, {
      estateId: member.estateId,
      actorUserId: session.userId,
      eventType: "member_invite_accepted",
      targetTable: "estate_members",
      targetId: member.id,
    });
    return NextResponse.json({ member });
  } catch (error) {
    return membershipErrorResponse(error);
  }
}
