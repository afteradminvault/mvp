import { NextResponse } from "next/server";
import { MembershipService } from "@/domain/membership/membership-service";
import { SupabaseMembershipRepository } from "@/infrastructure/membership/supabase-membership-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { membershipErrorResponse } from "@/app/api/_lib/membership-error-response";

type RouteParams = { params: Promise<{ token: string }> };

/**
 * Public per API Specification §3 — the invitee may not have an account
 * yet. Deliberately narrow: estate display name, role, and validity only,
 * via the get_invite_preview() RPC — never the full estate_members row or
 * any other estate data.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();
  const service = new MembershipService(new SupabaseMembershipRepository(supabase));
  try {
    const preview = await service.getInvitePreview(token);
    return NextResponse.json({ preview });
  } catch (error) {
    return membershipErrorResponse(error);
  }
}
