import { describe, expect, it, vi } from "vitest";
import type { DigitalVaultItem, VaultItemRepository } from "./ports";
import {
  InvalidVaultItemInputError,
  MAX_HEX_FIELD_LENGTH,
  VaultItemNotFoundError,
  VaultItemService,
} from "./vault-item-service";

function createFakeRepository(overrides: Partial<VaultItemRepository> = {}): VaultItemRepository {
  return {
    createItem: vi.fn(),
    listItems: vi.fn(),
    getItem: vi.fn(),
    rotateItem: vi.fn(),
    deleteItem: vi.fn(),
    ...overrides,
  };
}

function makeItem(overrides: Partial<DigitalVaultItem> = {}): DigitalVaultItem {
  return {
    id: "item-1",
    digitalAssetId: "asset-1",
    itemType: "password",
    ciphertext: "aabbcc",
    encryptionIv: "112233",
    wrappedDataKey: "445566",
    keyVersion: 1,
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
    ...overrides,
  };
}

describe("VaultItemService.createItem", () => {
  it("creates an item with well-formed hex fields", async () => {
    const item = makeItem();
    const repository = createFakeRepository({ createItem: vi.fn().mockResolvedValue(item) });
    const service = new VaultItemService(repository);

    const result = await service.createItem("asset-1", {
      itemType: "password",
      ciphertext: "aabbcc",
      encryptionIv: "112233",
      wrappedDataKey: "445566",
    });

    expect(repository.createItem).toHaveBeenCalledWith("asset-1", {
      itemType: "password",
      ciphertext: "aabbcc",
      encryptionIv: "112233",
      wrappedDataKey: "445566",
      keyVersion: undefined,
    });
    expect(result).toBe(item);
  });

  it("rejects an invalid itemType", async () => {
    const repository = createFakeRepository();
    const service = new VaultItemService(repository);

    await expect(
      service.createItem("asset-1", {
        itemType: "credit-card" as never,
        ciphertext: "aabbcc",
        encryptionIv: "112233",
        wrappedDataKey: "445566",
      }),
    ).rejects.toThrow(InvalidVaultItemInputError);
    expect(repository.createItem).not.toHaveBeenCalled();
  });

  it.each(["ciphertext", "encryptionIv", "wrappedDataKey"] as const)(
    "rejects a missing %s",
    async (field) => {
      const repository = createFakeRepository();
      const service = new VaultItemService(repository);
      const base = { itemType: "password" as const, ciphertext: "aabbcc", encryptionIv: "112233", wrappedDataKey: "445566" };

      await expect(service.createItem("asset-1", { ...base, [field]: "" })).rejects.toThrow(
        InvalidVaultItemInputError,
      );
    },
  );

  it("rejects a non-hex ciphertext", async () => {
    const repository = createFakeRepository();
    const service = new VaultItemService(repository);

    await expect(
      service.createItem("asset-1", {
        itemType: "password",
        ciphertext: "not-hex!!",
        encryptionIv: "112233",
        wrappedDataKey: "445566",
      }),
    ).rejects.toThrow(InvalidVaultItemInputError);
  });

  it("rejects an odd-length hex string", async () => {
    const repository = createFakeRepository();
    const service = new VaultItemService(repository);

    await expect(
      service.createItem("asset-1", {
        itemType: "password",
        ciphertext: "abc",
        encryptionIv: "112233",
        wrappedDataKey: "445566",
      }),
    ).rejects.toThrow(InvalidVaultItemInputError);
  });

  it(`rejects a ciphertext longer than ${MAX_HEX_FIELD_LENGTH} hex characters`, async () => {
    const repository = createFakeRepository();
    const service = new VaultItemService(repository);

    await expect(
      service.createItem("asset-1", {
        itemType: "password",
        ciphertext: "ab".repeat(MAX_HEX_FIELD_LENGTH / 2 + 1),
        encryptionIv: "112233",
        wrappedDataKey: "445566",
      }),
    ).rejects.toThrow(InvalidVaultItemInputError);
  });

  it("rejects a non-positive or non-integer keyVersion", async () => {
    const repository = createFakeRepository();
    const service = new VaultItemService(repository);
    const base = { itemType: "password" as const, ciphertext: "aabbcc", encryptionIv: "112233", wrappedDataKey: "445566" };

    await expect(service.createItem("asset-1", { ...base, keyVersion: 0 })).rejects.toThrow(
      InvalidVaultItemInputError,
    );
    await expect(service.createItem("asset-1", { ...base, keyVersion: 1.5 })).rejects.toThrow(
      InvalidVaultItemInputError,
    );
  });
});

describe("VaultItemService.listItems / getItem", () => {
  it("lists items for an asset", async () => {
    const items = [makeItem()];
    const repository = createFakeRepository({ listItems: vi.fn().mockResolvedValue(items) });
    const service = new VaultItemService(repository);

    await expect(service.listItems("asset-1")).resolves.toBe(items);
  });

  it("throws VaultItemNotFoundError when getItem finds nothing", async () => {
    const repository = createFakeRepository({ getItem: vi.fn().mockResolvedValue(null) });
    const service = new VaultItemService(repository);

    await expect(service.getItem("nonexistent")).rejects.toThrow(VaultItemNotFoundError);
  });
});

describe("VaultItemService.rotateItem", () => {
  it("rotates an existing item with new hex fields", async () => {
    const existing = makeItem();
    const rotated = makeItem({ ciphertext: "ffee00" });
    const repository = createFakeRepository({
      getItem: vi.fn().mockResolvedValue(existing),
      rotateItem: vi.fn().mockResolvedValue(rotated),
    });
    const service = new VaultItemService(repository);

    const result = await service.rotateItem("item-1", {
      ciphertext: "ffee00",
      encryptionIv: "112233",
      wrappedDataKey: "445566",
    });

    expect(repository.rotateItem).toHaveBeenCalledWith("item-1", {
      ciphertext: "ffee00",
      encryptionIv: "112233",
      wrappedDataKey: "445566",
    });
    expect(result).toBe(rotated);
  });

  it("throws VaultItemNotFoundError without calling rotateItem for a nonexistent item", async () => {
    const repository = createFakeRepository({ getItem: vi.fn().mockResolvedValue(null) });
    const service = new VaultItemService(repository);

    await expect(
      service.rotateItem("nonexistent", { ciphertext: "aabbcc", encryptionIv: "112233", wrappedDataKey: "445566" }),
    ).rejects.toThrow(VaultItemNotFoundError);
    expect(repository.rotateItem).not.toHaveBeenCalled();
  });

  it("rejects a non-hex field on rotate", async () => {
    const existing = makeItem();
    const repository = createFakeRepository({ getItem: vi.fn().mockResolvedValue(existing) });
    const service = new VaultItemService(repository);

    await expect(
      service.rotateItem("item-1", { ciphertext: "zz", encryptionIv: "112233", wrappedDataKey: "445566" }),
    ).rejects.toThrow(InvalidVaultItemInputError);
    expect(repository.rotateItem).not.toHaveBeenCalled();
  });
});

describe("VaultItemService.deleteItem", () => {
  it("deletes (hard) an existing item", async () => {
    const existing = makeItem();
    const repository = createFakeRepository({
      getItem: vi.fn().mockResolvedValue(existing),
      deleteItem: vi.fn().mockResolvedValue(undefined),
    });
    const service = new VaultItemService(repository);

    await service.deleteItem("item-1");
    expect(repository.deleteItem).toHaveBeenCalledWith("item-1");
  });

  it("throws VaultItemNotFoundError without calling deleteItem for a nonexistent item", async () => {
    const repository = createFakeRepository({ getItem: vi.fn().mockResolvedValue(null) });
    const service = new VaultItemService(repository);

    await expect(service.deleteItem("nonexistent")).rejects.toThrow(VaultItemNotFoundError);
    expect(repository.deleteItem).not.toHaveBeenCalled();
  });
});
