/**
 * Membership/nomination domain contracts (Security Architecture §1.1–§1.2,
 * API Specification §3). Framework-free, same rationale as the other
 * ports.ts files. Every key-material field here is a hex string (see
 * src/crypto/encoding.ts) this layer never interprets.
 */

export type MemberRole = "owner" | "executor" | "helper";
export type InviteStatus = "pending" | "accepted" | "revoked";
export type InvitableRole = "executor" | "helper";

export interface EstateMember {
  id: string;
  estateId: string;
  userId: string | null;
  role: MemberRole;
  inviteEmail: string;
  inviteStatus: InviteStatus;
  invitedAt: string;
  acceptedAt: string | null;
  fallbackOrder: number | null;
  hasWrappedVaultKey: boolean;
  createdAt: string;
  /**
   * Only ever populated on inviteMember()'s own response (the Owner just
   * created this invite and needs the shareable link) — always null from
   * listMembers(), which deliberately never selects invite_token so a
   * fellow member (e.g. a Helper) can never read another member's token
   * via the general list, even though RLS would otherwise allow reading
   * the row.
   */
  inviteToken: string | null;
}

export interface InvitePreview {
  estateDisplayName: string;
  role: MemberRole;
  valid: boolean;
}

export interface MemberPublicKey {
  memberId: string;
  publicKey: string;
}

export interface InviteMemberInput {
  inviteEmail: string;
  role: InvitableRole;
  fallbackOrder?: number;
}

export interface AcceptInviteInput {
  publicKey: string;
  wrappedPrivateKey: string;
  kdfSalt: string;
}

export interface MembershipRepository {
  inviteMember(estateId: string, input: InviteMemberInput): Promise<EstateMember>;
  listMembers(estateId: string): Promise<EstateMember[]>;
  getInvitePreview(token: string): Promise<InvitePreview>;
  acceptInvite(token: string, input: AcceptInviteInput): Promise<EstateMember>;
  getMemberPublicKeys(estateId: string): Promise<MemberPublicKey[]>;
  wrapKeyShareForMember(estateId: string, memberId: string, sealedVaultKey: string): Promise<EstateMember>;
  revokeMember(estateId: string, memberId: string): Promise<EstateMember>;
}
