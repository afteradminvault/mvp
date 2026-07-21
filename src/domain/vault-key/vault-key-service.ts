import type { InitializeVaultKeyInput, OwnerVaultKeyState, VaultKeyRepository } from "./ports";

export class InvalidVaultKeyInputError extends Error {}
export class VaultKeyAlreadyInitializedError extends Error {}
export class VaultKeyForbiddenError extends Error {}

function translateRepositoryError(error: unknown): never {
  if (error instanceof Error && /already initialized/i.test(error.message)) {
    throw new VaultKeyAlreadyInitializedError("This estate's vault key has already been initialized.");
  }
  if (error instanceof Error && /only the estate owner/i.test(error.message)) {
    throw new VaultKeyForbiddenError("Only the estate owner can access its vault key.");
  }
  throw error;
}

const HEX_PATTERN = /^[0-9a-fA-F]+$/;

function validateHexField(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new InvalidVaultKeyInputError(`${fieldName} is required.`);
  }
  if (value.length % 2 !== 0 || !HEX_PATTERN.test(value)) {
    throw new InvalidVaultKeyInputError(`${fieldName} must be a hex-encoded string.`);
  }
  return value;
}

/**
 * Orchestrates the one-time Vault Key bootstrap (docs/SECURITY_ARCHITECTURE.md
 * §1.1). Deliberately thin — the actual key generation/wrapping happens
 * entirely client-side (src/crypto/vault-key-hierarchy.ts); this service
 * only validates wire format and delegates to the initialize_owner_vault_key
 * RPC via the repository, which enforces the one-time invariant at the
 * database layer (see supabase/migrations/20260721000100_vault_key_bootstrap.sql).
 */
export class VaultKeyService {
  constructor(private readonly repository: VaultKeyRepository) {}

  async getOwnerVaultKeyState(estateId: string): Promise<OwnerVaultKeyState> {
    try {
      return await this.repository.getOwnerVaultKeyState(estateId);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async initializeOwnerVaultKey(estateId: string, input: InitializeVaultKeyInput): Promise<OwnerVaultKeyState> {
    const wrappedVaultKey = validateHexField(input.wrappedVaultKey, "wrappedVaultKey");
    const kdfSalt = input.kdfSalt === undefined ? undefined : validateHexField(input.kdfSalt, "kdfSalt");

    try {
      return await this.repository.initializeOwnerVaultKey(estateId, { wrappedVaultKey, kdfSalt });
    } catch (error) {
      translateRepositoryError(error);
    }
  }
}
