import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AcceptInviteInput,
  EstateMember,
  InviteMemberInput,
  InvitePreview,
  MemberPublicKey,
  MemberRole,
  MembershipRepository,
} from "@/domain/membership/ports";
import { fromByteaColumn, toByteaColumn } from "@/infrastructure/supabase/bytea-hex";

interface MemberRow {
  id: string;
  estate_id: string;
  user_id: string | null;
  role: MemberRole;
  invite_email: string;
  invite_status: "pending" | "accepted" | "revoked";
  invited_at: string;
  accepted_at: string | null;
  fallback_order: number | null;
  wrapped_vault_key: string | null;
  created_at: string;
  invite_token?: string;
}

function toEstateMember(row: MemberRow, includeInviteToken: boolean): EstateMember {
  return {
    id: row.id,
    estateId: row.estate_id,
    userId: row.user_id,
    role: row.role,
    inviteEmail: row.invite_email,
    inviteStatus: row.invite_status,
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at,
    fallbackOrder: row.fallback_order,
    hasWrappedVaultKey: row.wrapped_vault_key !== null,
    createdAt: row.created_at,
    inviteToken: includeInviteToken && row.invite_token ? row.invite_token : null,
  };
}

/**
 * Concrete adapter against Supabase. Every mutation goes through the
 * SECURITY DEFINER RPCs from
 * supabase/migrations/20260721000300_membership_invite_flow.sql — this
 * repository does no authorization logic of its own beyond selecting the
 * right columns (deliberately never invite_token in listMembers — see
 * ports.ts).
 */
export class SupabaseMembershipRepository implements MembershipRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async inviteMember(estateId: string, input: InviteMemberInput): Promise<EstateMember> {
    const { data, error } = await this.supabase.rpc("invite_member", {
      p_estate_id: estateId,
      p_invite_email: input.inviteEmail,
      p_role: input.role,
      ...(input.fallbackOrder !== undefined ? { p_fallback_order: input.fallbackOrder } : {}),
    });
    if (error) throw error;
    return toEstateMember(data as MemberRow, true);
  }

  async listMembers(estateId: string): Promise<EstateMember[]> {
    const { data, error } = await this.supabase
      .from("estate_members")
      .select(
        "id, estate_id, user_id, role, invite_email, invite_status, invited_at, accepted_at, fallback_order, wrapped_vault_key, created_at",
      )
      .eq("estate_id", estateId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data as MemberRow[]).map((row) => toEstateMember(row, false));
  }

  async getInvitePreview(token: string): Promise<InvitePreview> {
    const { data, error } = await this.supabase.rpc("get_invite_preview", { p_token: token });
    if (error) throw error;
    const row = (data as { estate_display_name: string; role: MemberRole; valid: boolean }[])[0];
    if (!row) {
      throw new Error("invite not found or already used");
    }
    return { estateDisplayName: row.estate_display_name, role: row.role, valid: row.valid };
  }

  async acceptInvite(token: string, input: AcceptInviteInput): Promise<EstateMember> {
    const { data, error } = await this.supabase.rpc("accept_invite", {
      p_token: token,
      p_public_key: toByteaColumn(input.publicKey),
      p_wrapped_private_key: toByteaColumn(input.wrappedPrivateKey),
      p_kdf_salt: toByteaColumn(input.kdfSalt),
    });
    if (error) throw error;
    return toEstateMember(data as MemberRow, false);
  }

  async getMemberPublicKeys(estateId: string): Promise<MemberPublicKey[]> {
    const { data, error } = await this.supabase.rpc("get_member_public_keys", { p_estate_id: estateId });
    if (error) throw error;
    return (data as { member_id: string; public_key: string }[]).map((row) => ({
      memberId: row.member_id,
      publicKey: fromByteaColumn(row.public_key) as string,
    }));
  }

  async wrapKeyShareForMember(estateId: string, memberId: string, sealedVaultKey: string): Promise<EstateMember> {
    const { data, error } = await this.supabase.rpc("wrap_key_share_for_member", {
      p_estate_id: estateId,
      p_member_id: memberId,
      p_sealed_vault_key: toByteaColumn(sealedVaultKey),
    });
    if (error) throw error;
    return toEstateMember(data as MemberRow, false);
  }

  async revokeMember(estateId: string, memberId: string): Promise<EstateMember> {
    const { data, error } = await this.supabase.rpc("revoke_member", {
      p_estate_id: estateId,
      p_member_id: memberId,
    });
    if (error) throw error;
    return toEstateMember(data as MemberRow, false);
  }
}
