import type { EstateRepository } from "@/domain/estates/ports";
import { EstateNotFoundError } from "@/domain/estates/estate-service";
import type { ExecutorKeyRecoveryMaterial, KeyRecoveryRepository } from "./ports";

export class KeyRecoveryNotAvailableError extends Error {}
export class KeyRecoveryForbiddenError extends Error {}

/**
 * Orchestrates the key-recovery read (Security Architecture §1.2). The
 * app-layer status gate here is real defense-in-depth, but it is not the
 * control that actually prevents plaintext exposure before death — that's
 * digital_vault_items_select_executor_post_death, an RLS policy that has
 * been live since the initial schema migration and independently blocks
 * ciphertext reads until estates.status = 'active_executor' regardless of
 * anything this service does. This gate exists because a real system
 * shouldn't skip a cheap additional control just because the crypto (and a
 * separate RLS policy) already make it safe — not because skipping it
 * would leak plaintext.
 *
 * The status check happens *before* any query for wrapped material, so
 * the forbidden case never even attempts that read.
 */
export class KeyRecoveryService {
  constructor(
    private readonly estateRepository: EstateRepository,
    private readonly keyRecoveryRepository: KeyRecoveryRepository,
  ) {}

  async getExecutorKeyRecoveryMaterial(estateId: string, userId: string): Promise<ExecutorKeyRecoveryMaterial> {
    const estate = await this.estateRepository.getEstate(estateId);
    if (!estate) {
      throw new EstateNotFoundError("Estate not found, or you don't have access to it.");
    }
    if (estate.status !== "active_executor") {
      throw new KeyRecoveryNotAvailableError(
        `Key recovery is only available once the estate has reached active_executor status (currently "${estate.status}").`,
      );
    }

    const material = await this.keyRecoveryRepository.getExecutorKeyRecoveryMaterial(estateId, userId);
    if (!material) {
      throw new KeyRecoveryForbiddenError(
        "You are not an accepted executor for this estate, or no wrapped key material is on file yet.",
      );
    }
    return material;
  }
}
