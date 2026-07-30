import { describe, expect, it, vi } from "vitest";
import type { DigitalAsset, DigitalAssetRepository } from "@/domain/assets/ports";
import type { DigitalVaultItem, VaultItemRepository } from "@/domain/vault-items/ports";
import type { VaultPreviewLetter, VaultPreviewLetterRepository } from "./ports";
import { VaultPreviewLetterNotFoundError, VaultPreviewLetterService } from "./vault-preview-letter-service";

function makeAsset(overrides: Partial<DigitalAsset> = {}): DigitalAsset {
  return {
    id: "asset-1",
    estateId: "estate-1",
    category: "financial",
    providerId: null,
    customProviderName: "Chase Checking ****1234",
    accountIdentifier: "marcus.whitfield@example.com",
    intendedOutcome: "close",
    intendedOutcomeNotes: null,
    estimatedValueCents: null,
    currency: null,
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

function makeVaultItem(overrides: Partial<DigitalVaultItem> = {}): DigitalVaultItem {
  return {
    id: "item-1",
    digitalAssetId: "asset-1",
    itemType: "password",
    ciphertext: "aabbccddeeff",
    encryptionIv: "112233",
    wrappedDataKey: "445566",
    keyVersion: 1,
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

function makeLetter(overrides: Partial<VaultPreviewLetter> = {}): VaultPreviewLetter {
  return {
    id: "letter-1",
    estateId: "estate-1",
    generatedByUserId: "user-1",
    itemTypeSummary: { password: 1 },
    generatedAt: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

function makeService(overrides: {
  letterRepository?: Partial<VaultPreviewLetterRepository>;
  assetRepository?: Partial<DigitalAssetRepository>;
  vaultItemRepository?: Partial<VaultItemRepository>;
} = {}) {
  const letterRepository = {
    createLetter: vi.fn().mockResolvedValue(makeLetter()),
    listLetters: vi.fn(),
    getLetter: vi.fn(),
    ...overrides.letterRepository,
  } as VaultPreviewLetterRepository;

  const assetRepository = {
    listAssets: vi.fn().mockResolvedValue([makeAsset()]),
    ...overrides.assetRepository,
  } as unknown as DigitalAssetRepository;

  const vaultItemRepository = {
    listItems: vi.fn().mockResolvedValue([makeVaultItem()]),
    ...overrides.vaultItemRepository,
  } as unknown as VaultItemRepository;

  return {
    service: new VaultPreviewLetterService(letterRepository, assetRepository, vaultItemRepository),
    letterRepository,
    assetRepository,
    vaultItemRepository,
  };
}

describe("VaultPreviewLetterService.generateLetter 🔒 security", () => {
  it("never includes any asset label, account identifier, or ciphertext field in the generated summary — counts only", async () => {
    // Deliberately identifying/sensitive-looking fixture data (real
    // provider names, account identifiers, ciphertext bytes) — the
    // assertion is that NONE of these specific strings, nor any key
    // other than a VaultItemType, ever appear in what gets persisted.
    const sensitiveAsset = makeAsset({
      customProviderName: "Chase Checking ****1234",
      accountIdentifier: "marcus.whitfield@example.com",
    });
    const sensitiveItems = [
      makeVaultItem({ id: "item-1", itemType: "password", ciphertext: "deadbeef00112233" }),
      makeVaultItem({ id: "item-2", itemType: "password", ciphertext: "cafebabe44556677" }),
      makeVaultItem({ id: "item-3", itemType: "crypto_seed_phrase", ciphertext: "0123456789abcdef" }),
    ];
    const { service, letterRepository } = makeService({
      assetRepository: { listAssets: vi.fn().mockResolvedValue([sensitiveAsset]) },
      vaultItemRepository: { listItems: vi.fn().mockResolvedValue(sensitiveItems) },
    });

    await service.generateLetter("estate-1", "user-1");

    expect(letterRepository.createLetter).toHaveBeenCalledWith("estate-1", "user-1", {
      password: 2,
      crypto_seed_phrase: 1,
    });

    const persistedSummary = (letterRepository.createLetter as ReturnType<typeof vi.fn>).mock.calls[0][2];
    const serialized = JSON.stringify(persistedSummary);
    expect(serialized).not.toContain("Chase");
    expect(serialized).not.toContain("marcus.whitfield");
    expect(serialized).not.toContain("deadbeef");
    expect(serialized).not.toContain("cafebabe");
    expect(serialized).not.toContain("0123456789abcdef");
    expect(serialized).not.toContain("****1234");
    // Every key in the persisted summary must be a bare VaultItemType, nothing else.
    expect(Object.keys(persistedSummary)).toEqual(
      expect.arrayContaining(["password", "crypto_seed_phrase"]),
    );
    expect(Object.keys(persistedSummary)).toHaveLength(2);
  });

  it("counts across multiple assets, grouped by item type", async () => {
    const { service, letterRepository, assetRepository, vaultItemRepository } = makeService({
      assetRepository: {
        listAssets: vi.fn().mockResolvedValue([makeAsset({ id: "asset-1" }), makeAsset({ id: "asset-2" })]),
      },
      vaultItemRepository: {
        listItems: vi.fn((assetId: string) =>
          Promise.resolve(
            assetId === "asset-1"
              ? [makeVaultItem({ itemType: "password" }), makeVaultItem({ itemType: "bank_detail" })]
              : [makeVaultItem({ itemType: "password" })],
          ),
        ) as unknown as VaultItemRepository["listItems"],
      },
    });

    await service.generateLetter("estate-1", "user-1");

    expect(vaultItemRepository.listItems).toHaveBeenCalledWith("asset-1");
    expect(vaultItemRepository.listItems).toHaveBeenCalledWith("asset-2");
    expect(letterRepository.createLetter).toHaveBeenCalledWith("estate-1", "user-1", {
      password: 2,
      bank_detail: 1,
    });
    expect(assetRepository.listAssets).toHaveBeenCalledWith("estate-1", { includeArchived: true });
  });

  it("produces an empty summary when there are no vault items", async () => {
    const { service, letterRepository } = makeService({
      assetRepository: { listAssets: vi.fn().mockResolvedValue([]) },
    });

    await service.generateLetter("estate-1", "user-1");

    expect(letterRepository.createLetter).toHaveBeenCalledWith("estate-1", "user-1", {});
  });
});

describe("VaultPreviewLetterService.listLetters / getLetter", () => {
  it("listLetters delegates directly to the repository", async () => {
    const letters = [makeLetter()];
    const { service, letterRepository } = makeService({
      letterRepository: { listLetters: vi.fn().mockResolvedValue(letters) },
    });

    await expect(service.listLetters("estate-1")).resolves.toBe(letters);
    expect(letterRepository.listLetters).toHaveBeenCalledWith("estate-1");
  });

  it("getLetter returns the letter when found", async () => {
    const letter = makeLetter();
    const { service } = makeService({ letterRepository: { getLetter: vi.fn().mockResolvedValue(letter) } });

    await expect(service.getLetter("letter-1")).resolves.toBe(letter);
  });

  it("getLetter throws VaultPreviewLetterNotFoundError when not found", async () => {
    const { service } = makeService({ letterRepository: { getLetter: vi.fn().mockResolvedValue(null) } });

    await expect(service.getLetter("nonexistent")).rejects.toThrow(VaultPreviewLetterNotFoundError);
  });
});
