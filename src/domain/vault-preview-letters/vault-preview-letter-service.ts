import type { DigitalAssetRepository } from "@/domain/assets/ports";
import type { VaultItemRepository } from "@/domain/vault-items/ports";
import type { VaultPreviewLetter, VaultPreviewLetterRepository } from "./ports";

export class VaultPreviewLetterNotFoundError extends Error {}

/**
 * 🔒 Security-sensitive (US-3.6). Computes item_type_summary by reading
 * through the existing, already-RLS-scoped asset/vault-item repositories
 * — never a raw query of its own — so a caller with limited or no vault
 * access (e.g. an executor pre-verification) gets a correspondingly
 * limited or empty summary, the same access boundary digital_vault_items
 * itself enforces, not a second one to keep in sync.
 *
 * Archived assets are included: an archived asset's vault items still
 * physically exist (archiving is a soft-delete on the asset, not its
 * vault items) and a lawyer advising on "what exists" should see them
 * counted, not silently dropped.
 */
export class VaultPreviewLetterService {
  constructor(
    private readonly repository: VaultPreviewLetterRepository,
    private readonly assetRepository: DigitalAssetRepository,
    private readonly vaultItemRepository: VaultItemRepository,
  ) {}

  async generateLetter(estateId: string, generatedByUserId: string): Promise<VaultPreviewLetter> {
    const assets = await this.assetRepository.listAssets(estateId, { includeArchived: true });

    const itemTypeSummary: Record<string, number> = {};
    for (const asset of assets) {
      const items = await this.vaultItemRepository.listItems(asset.id);
      for (const item of items) {
        itemTypeSummary[item.itemType] = (itemTypeSummary[item.itemType] ?? 0) + 1;
      }
    }

    return this.repository.createLetter(estateId, generatedByUserId, itemTypeSummary);
  }

  async listLetters(estateId: string): Promise<VaultPreviewLetter[]> {
    return this.repository.listLetters(estateId);
  }

  async getLetter(letterId: string): Promise<VaultPreviewLetter> {
    const letter = await this.repository.getLetter(letterId);
    if (!letter) {
      throw new VaultPreviewLetterNotFoundError("Vault preview letter not found, or you don't have access to it.");
    }
    return letter;
  }
}
