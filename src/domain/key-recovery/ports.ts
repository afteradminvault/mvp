/**
 * Executor key-recovery contracts (Security Architecture §1.2, API
 * Specification §4 — "the single most access-controlled read in the
 * API"). Every field here is opaque hex-encoded ciphertext/key material
 * (see src/crypto/encoding.ts) — this layer never decodes or interprets
 * it, only passes it through. No plaintext ever reaches this file; it
 * doesn't run client-side.
 */
export interface ExecutorKeyRecoveryMaterial {
  wrappedVaultKey: string;
  publicKey: string;
  wrappedPrivateKey: string;
  kdfSalt: string;
}

export interface KeyRecoveryRepository {
  /**
   * Null when the caller isn't an accepted executor for this estate, or no
   * wrapped material is on file yet (e.g. the Owner hasn't wrapped a VK
   * copy for them) — both are legitimate "nothing to return" outcomes, not
   * server errors.
   */
  getExecutorKeyRecoveryMaterial(estateId: string, userId: string): Promise<ExecutorKeyRecoveryMaterial | null>;
}
