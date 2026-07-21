import type {
  AcceptInviteInput,
  EstateMember,
  InviteMemberInput,
  InvitePreview,
  InvitableRole,
  MemberPublicKey,
  MembershipRepository,
} from "./ports";

export const INVITABLE_ROLES: readonly InvitableRole[] = ["executor", "helper"];

export class InvalidMembershipInputError extends Error {}
export class MembershipForbiddenError extends Error {}
export class MembershipNotFoundError extends Error {}
export class InviteInvalidOrExpiredError extends Error {}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_PATTERN = /^[0-9a-fA-F]+$/;

function validateEmail(email: unknown): string {
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    throw new InvalidMembershipInputError("A valid invite email is required.");
  }
  return email.trim();
}

function validateInvitableRole(role: unknown): InvitableRole {
  if (typeof role !== "string" || !INVITABLE_ROLES.includes(role as InvitableRole)) {
    throw new InvalidMembershipInputError(`role must be one of: ${INVITABLE_ROLES.join(", ")}.`);
  }
  return role as InvitableRole;
}

function validateFallbackOrder(fallbackOrder: unknown): number | undefined {
  if (fallbackOrder === undefined) return undefined;
  if (!Number.isInteger(fallbackOrder) || (fallbackOrder as number) < 1) {
    throw new InvalidMembershipInputError("fallbackOrder must be a positive integer.");
  }
  return fallbackOrder as number;
}

function validateHexField(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new InvalidMembershipInputError(`${fieldName} is required.`);
  }
  if (value.length % 2 !== 0 || !HEX_PATTERN.test(value)) {
    throw new InvalidMembershipInputError(`${fieldName} must be a hex-encoded string.`);
  }
  return value;
}

function validateToken(token: unknown): string {
  if (typeof token !== "string" || token.trim().length === 0) {
    throw new InvalidMembershipInputError("An invite token is required.");
  }
  return token.trim();
}

/** Every RPC in this domain raises a plain Postgres exception; this maps their messages to typed errors, once, in one place. */
function translateRepositoryError(error: unknown): never {
  if (error instanceof Error) {
    if (/only the estate owner|cannot invite a second owner|cannot revoke the estate owner/i.test(error.message)) {
      throw new MembershipForbiddenError(error.message);
    }
    if (/not found or not yet accepted|^member not found$/i.test(error.message)) {
      throw new MembershipNotFoundError("Member not found.");
    }
    if (/invite not found or already used|invite has expired/i.test(error.message)) {
      throw new InviteInvalidOrExpiredError("This invite is no longer valid.");
    }
  }
  throw error;
}

/**
 * Orchestrates the nomination flow. No crypto happens here — keypair
 * generation, VK sealing, and private-key wrapping are all client-side
 * (src/crypto/vault-key-hierarchy.ts, src/crypto/asymmetric.ts). This
 * service validates wire format/business rules and delegates every
 * mutation to the narrow SECURITY DEFINER RPCs in
 * supabase/migrations/20260721000300_membership_invite_flow.sql, which
 * enforce the real authorization at the database layer.
 */
export class MembershipService {
  constructor(private readonly repository: MembershipRepository) {}

  async inviteMember(estateId: string, input: InviteMemberInput): Promise<EstateMember> {
    const inviteEmail = validateEmail(input.inviteEmail);
    const role = validateInvitableRole(input.role);
    const fallbackOrder = validateFallbackOrder(input.fallbackOrder);

    try {
      return await this.repository.inviteMember(estateId, { inviteEmail, role, fallbackOrder });
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async listMembers(estateId: string): Promise<EstateMember[]> {
    return this.repository.listMembers(estateId);
  }

  async getInvitePreview(token: unknown): Promise<InvitePreview> {
    const validToken = validateToken(token);
    try {
      return await this.repository.getInvitePreview(validToken);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async acceptInvite(token: unknown, input: AcceptInviteInput): Promise<EstateMember> {
    const validToken = validateToken(token);
    const publicKey = validateHexField(input.publicKey, "publicKey");
    const wrappedPrivateKey = validateHexField(input.wrappedPrivateKey, "wrappedPrivateKey");
    const kdfSalt = validateHexField(input.kdfSalt, "kdfSalt");

    try {
      return await this.repository.acceptInvite(validToken, { publicKey, wrappedPrivateKey, kdfSalt });
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async getMemberPublicKeys(estateId: string): Promise<MemberPublicKey[]> {
    try {
      return await this.repository.getMemberPublicKeys(estateId);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async wrapKeyShareForMember(estateId: string, memberId: string, sealedVaultKey: unknown): Promise<EstateMember> {
    const validSealedVaultKey = validateHexField(sealedVaultKey, "sealedVaultKey");
    try {
      return await this.repository.wrapKeyShareForMember(estateId, memberId, validSealedVaultKey);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async revokeMember(estateId: string, memberId: string): Promise<EstateMember> {
    try {
      return await this.repository.revokeMember(estateId, memberId);
    } catch (error) {
      translateRepositoryError(error);
    }
  }
}
