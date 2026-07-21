import { NextResponse } from "next/server";
import { MembershipService } from "@/domain/membership/membership-service";
import { SupabaseMembershipRepository } from "@/infrastructure/membership/supabase-membership-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { membershipErrorResponse } from "@/app/api/_lib/membership-error-response";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Owner-only. Public keys are not secret, but this is still a narrow,
 * purpose-built endpoint (get_member_public_keys RPC) rather than
 * loosening users' RLS generally — see the migration's comment. Used by
 * the Owner's client to know which accepted members still need a
 * wrap-key-share call.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new MembershipService(new SupabaseMembershipRepository(session.supabase));
  try {
    const publicKeys = await service.getMemberPublicKeys(id);
    return NextResponse.json({ publicKeys });
  } catch (error) {
    return membershipErrorResponse(error);
  }
}
