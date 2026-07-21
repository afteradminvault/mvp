/**
 * Vault-key bootstrap domain contracts. Covers only the Owner's own
 * wrapped Vault Key + their account's KDF salt (docs/SECURITY_ARCHITECTURE.md
 * §1.1) — not the item-level crypto (src/domain/vault-items) and not the
 * member-wrapping flow (Milestone 1 feature 5). Framework-free; hex
 * strings only, never interpreted here.
 */

export interface OwnerVaultKeyState {
  wrappedVaultKey: string | null;
  kdfSalt: string | null;
}

export interface InitializeVaultKeyInput {
  wrappedVaultKey: string;
  kdfSalt?: string;
}

export interface VaultKeyRepository {
  getOwnerVaultKeyState(estateId: string): Promise<OwnerVaultKeyState>;
  initializeOwnerVaultKey(estateId: string, input: InitializeVaultKeyInput): Promise<OwnerVaultKeyState>;
}
