import type { VaultItemType } from "@/domain/vault-items/ports";

/**
 * Vault Preview Letter domain contracts (Database Schema v2 §2.10, US-3.6)
 * 🔒 security-sensitive — the whole point of this table is that it can
 * NEVER carry more than type counts. Framework-free, same rationale as
 * the other ports.ts files.
 */
export interface VaultPreviewLetter {
  id: string;
  estateId: string;
  generatedByUserId: string;
  /** Counts only, e.g. { password: 3, crypto_seed_phrase: 1 } — never a label, account identifier, or value. */
  itemTypeSummary: Partial<Record<VaultItemType, number>>;
  generatedAt: string;
}

export interface VaultPreviewLetterRepository {
  createLetter(
    estateId: string,
    generatedByUserId: string,
    itemTypeSummary: Partial<Record<VaultItemType, number>>,
  ): Promise<VaultPreviewLetter>;
  listLetters(estateId: string): Promise<VaultPreviewLetter[]>;
  getLetter(letterId: string): Promise<VaultPreviewLetter | null>;
}
