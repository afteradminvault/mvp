import { NextResponse } from "next/server";
import { MembershipService } from "@/domain/membership/membership-service";
import { SupabaseMembershipRepository } from "@/infrastructure/membership/supabase-membership-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { membershipErrorResponse } from "@/app/api/_lib/membership-error-response";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * API Specification §3: "List members and roles (not their key material)."
 * hasWrappedVaultKey is a boolean the repository computes from the raw
 * column — the actual ciphertext, invite_token, and any wrapped/private
 * key material are never selected into this response at all.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new MembershipService(new SupabaseMembershipRepository(session.supabase));
  try {
    const members = await service.listMembers(id);
    return NextResponse.json({ members });
  } catch (error) {
    return membershipErrorResponse(error);
  }
}
