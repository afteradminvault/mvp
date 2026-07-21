import { describe, expect, it, vi } from "vitest";
import type { DigitalAsset, DigitalAssetRepository } from "./ports";
import {
  AssetNotFoundError,
  AssetService,
  InvalidAssetInputError,
  MAX_ACCOUNT_IDENTIFIER_LENGTH,
  MAX_CUSTOM_PROVIDER_NAME_LENGTH,
  MAX_NOTES_LENGTH,
} from "./asset-service";

function createFakeRepository(overrides: Partial<DigitalAssetRepository> = {}): DigitalAssetRepository {
  return {
    createAsset: vi.fn(),
    getAsset: vi.fn(),
    updateAsset: vi.fn(),
    archiveAsset: vi.fn(),
    listAssets: vi.fn(),
    ...overrides,
  };
}

function makeAsset(overrides: Partial<DigitalAsset> = {}): DigitalAsset {
  return {
    id: "asset-1",
    estateId: "estate-1",
    category: "financial",
    providerId: null,
    customProviderName: "Chase Checking",
    accountIdentifier: "****1234",
    intendedOutcome: "close",
    intendedOutcomeNotes: null,
    estimatedValueCents: null,
    currency: null,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

describe("AssetService.createAsset", () => {
  it("creates an asset with a custom provider name", async () => {
    const asset = makeAsset();
    const repository = createFakeRepository({ createAsset: vi.fn().mockResolvedValue(asset) });
    const service = new AssetService(repository);

    const result = await service.createAsset("estate-1", {
      category: "financial",
      customProviderName: "Chase Checking",
      accountIdentifier: "****1234",
      intendedOutcome: "close",
    });

    expect(repository.createAsset).toHaveBeenCalledWith("estate-1", {
      category: "financial",
      providerId: null,
      customProviderName: "Chase Checking",
      accountIdentifier: "****1234",
      intendedOutcome: "close",
      intendedOutcomeNotes: null,
      estimatedValueCents: null,
      currency: null,
    });
    expect(result).toBe(asset);
  });

  it("creates an asset with a known provider id instead of a custom name", async () => {
    const asset = makeAsset({ providerId: "provider-1", customProviderName: null });
    const repository = createFakeRepository({ createAsset: vi.fn().mockResolvedValue(asset) });
    const service = new AssetService(repository);

    await service.createAsset("estate-1", { category: "financial", providerId: "provider-1" });

    expect(repository.createAsset).toHaveBeenCalledWith(
      "estate-1",
      expect.objectContaining({ providerId: "provider-1", customProviderName: null }),
    );
  });

  it("defaults intendedOutcome/notes/value/currency when not provided", async () => {
    const asset = makeAsset();
    const repository = createFakeRepository({ createAsset: vi.fn().mockResolvedValue(asset) });
    const service = new AssetService(repository);

    await service.createAsset("estate-1", { category: "other", customProviderName: "Some Site" });

    expect(repository.createAsset).toHaveBeenCalledWith(
      "estate-1",
      expect.objectContaining({
        intendedOutcome: undefined,
        intendedOutcomeNotes: null,
        estimatedValueCents: null,
        currency: null,
      }),
    );
  });

  it("rejects an invalid category", async () => {
    const repository = createFakeRepository();
    const service = new AssetService(repository);

    await expect(
      service.createAsset("estate-1", { category: "not-a-category" as never, customProviderName: "X" }),
    ).rejects.toThrow(InvalidAssetInputError);
    expect(repository.createAsset).not.toHaveBeenCalled();
  });

  it("rejects when neither providerId nor customProviderName is given", async () => {
    const repository = createFakeRepository();
    const service = new AssetService(repository);

    await expect(service.createAsset("estate-1", { category: "financial" })).rejects.toThrow(
      InvalidAssetInputError,
    );
  });

  it("rejects when both providerId and customProviderName are given", async () => {
    const repository = createFakeRepository();
    const service = new AssetService(repository);

    await expect(
      service.createAsset("estate-1", {
        category: "financial",
        providerId: "provider-1",
        customProviderName: "Chase",
      }),
    ).rejects.toThrow(InvalidAssetInputError);
  });

  it("rejects a blank custom provider name", async () => {
    const repository = createFakeRepository();
    const service = new AssetService(repository);

    await expect(
      service.createAsset("estate-1", { category: "financial", customProviderName: "   " }),
    ).rejects.toThrow(InvalidAssetInputError);
  });

  it(`rejects a custom provider name longer than ${MAX_CUSTOM_PROVIDER_NAME_LENGTH} characters`, async () => {
    const repository = createFakeRepository();
    const service = new AssetService(repository);

    await expect(
      service.createAsset("estate-1", {
        category: "financial",
        customProviderName: "x".repeat(MAX_CUSTOM_PROVIDER_NAME_LENGTH + 1),
      }),
    ).rejects.toThrow(InvalidAssetInputError);
  });

  it(`rejects an account identifier longer than ${MAX_ACCOUNT_IDENTIFIER_LENGTH} characters`, async () => {
    const repository = createFakeRepository();
    const service = new AssetService(repository);

    await expect(
      service.createAsset("estate-1", {
        category: "financial",
        customProviderName: "Chase",
        accountIdentifier: "x".repeat(MAX_ACCOUNT_IDENTIFIER_LENGTH + 1),
      }),
    ).rejects.toThrow(InvalidAssetInputError);
  });

  it(`rejects intended outcome notes longer than ${MAX_NOTES_LENGTH} characters`, async () => {
    const repository = createFakeRepository();
    const service = new AssetService(repository);

    await expect(
      service.createAsset("estate-1", {
        category: "financial",
        customProviderName: "Chase",
        intendedOutcomeNotes: "x".repeat(MAX_NOTES_LENGTH + 1),
      }),
    ).rejects.toThrow(InvalidAssetInputError);
  });

  it("rejects an invalid intendedOutcome", async () => {
    const repository = createFakeRepository();
    const service = new AssetService(repository);

    await expect(
      service.createAsset("estate-1", {
        category: "financial",
        customProviderName: "Chase",
        intendedOutcome: "delete-everything" as never,
      }),
    ).rejects.toThrow(InvalidAssetInputError);
  });

  it("rejects estimatedValueCents without a currency", async () => {
    const repository = createFakeRepository();
    const service = new AssetService(repository);

    await expect(
      service.createAsset("estate-1", {
        category: "financial",
        customProviderName: "Chase",
        estimatedValueCents: 10000,
      }),
    ).rejects.toThrow(InvalidAssetInputError);
  });

  it("rejects a currency without estimatedValueCents", async () => {
    const repository = createFakeRepository();
    const service = new AssetService(repository);

    await expect(
      service.createAsset("estate-1", {
        category: "financial",
        customProviderName: "Chase",
        currency: "USD",
      }),
    ).rejects.toThrow(InvalidAssetInputError);
  });

  it("rejects a negative or non-integer estimatedValueCents", async () => {
    const repository = createFakeRepository();
    const service = new AssetService(repository);

    await expect(
      service.createAsset("estate-1", {
        category: "financial",
        customProviderName: "Chase",
        estimatedValueCents: -1,
        currency: "USD",
      }),
    ).rejects.toThrow(InvalidAssetInputError);

    await expect(
      service.createAsset("estate-1", {
        category: "financial",
        customProviderName: "Chase",
        estimatedValueCents: 10.5,
        currency: "USD",
      }),
    ).rejects.toThrow(InvalidAssetInputError);
  });

  it("rejects a malformed currency code", async () => {
    const repository = createFakeRepository();
    const service = new AssetService(repository);

    await expect(
      service.createAsset("estate-1", {
        category: "financial",
        customProviderName: "Chase",
        estimatedValueCents: 100,
        currency: "US",
      }),
    ).rejects.toThrow(InvalidAssetInputError);
  });

  it("normalizes a lowercase currency code to uppercase", async () => {
    const asset = makeAsset({ estimatedValueCents: 100, currency: "USD" });
    const repository = createFakeRepository({ createAsset: vi.fn().mockResolvedValue(asset) });
    const service = new AssetService(repository);

    await service.createAsset("estate-1", {
      category: "financial",
      customProviderName: "Chase",
      estimatedValueCents: 100,
      currency: "usd",
    });

    expect(repository.createAsset).toHaveBeenCalledWith(
      "estate-1",
      expect.objectContaining({ currency: "USD" }),
    );
  });
});

describe("AssetService.getAsset", () => {
  it("returns the asset when found", async () => {
    const asset = makeAsset();
    const repository = createFakeRepository({ getAsset: vi.fn().mockResolvedValue(asset) });
    const service = new AssetService(repository);

    await expect(service.getAsset("asset-1")).resolves.toBe(asset);
  });

  it("throws AssetNotFoundError when not found", async () => {
    const repository = createFakeRepository({ getAsset: vi.fn().mockResolvedValue(null) });
    const service = new AssetService(repository);

    await expect(service.getAsset("nonexistent")).rejects.toThrow(AssetNotFoundError);
  });
});

describe("AssetService.updateAsset", () => {
  it("only forwards fields that were provided, merging identity fields with existing values", async () => {
    const existing = makeAsset();
    const updated = makeAsset({ accountIdentifier: "****9999" });
    const repository = createFakeRepository({
      getAsset: vi.fn().mockResolvedValue(existing),
      updateAsset: vi.fn().mockResolvedValue(updated),
    });
    const service = new AssetService(repository);

    await service.updateAsset("asset-1", { accountIdentifier: "****9999" });

    expect(repository.updateAsset).toHaveBeenCalledWith("asset-1", { accountIdentifier: "****9999" });
  });

  it("re-validates provider identity against the merged (existing + patch) state", async () => {
    const existing = makeAsset({ providerId: null, customProviderName: "Chase Checking" });
    const repository = createFakeRepository({
      getAsset: vi.fn().mockResolvedValue(existing),
      updateAsset: vi.fn().mockResolvedValue(existing),
    });
    const service = new AssetService(repository);

    // Switching to a providerId without explicitly clearing customProviderName
    // must fail — the merged state would have both set, which is invalid.
    await expect(service.updateAsset("asset-1", { providerId: "provider-1" })).rejects.toThrow(
      InvalidAssetInputError,
    );
  });

  it("allows switching from custom name to a known provider when the custom name is explicitly cleared", async () => {
    const existing = makeAsset({ providerId: null, customProviderName: "Chase Checking" });
    const updated = makeAsset({ providerId: "provider-1", customProviderName: null });
    const repository = createFakeRepository({
      getAsset: vi.fn().mockResolvedValue(existing),
      updateAsset: vi.fn().mockResolvedValue(updated),
    });
    const service = new AssetService(repository);

    await service.updateAsset("asset-1", { providerId: "provider-1", customProviderName: null });

    expect(repository.updateAsset).toHaveBeenCalledWith("asset-1", {
      providerId: "provider-1",
      customProviderName: null,
    });
  });

  it("rejects editing an archived asset", async () => {
    const existing = makeAsset({ archivedAt: "2026-07-20T00:00:00.000Z" });
    const repository = createFakeRepository({ getAsset: vi.fn().mockResolvedValue(existing) });
    const service = new AssetService(repository);

    await expect(service.updateAsset("asset-1", { accountIdentifier: "new" })).rejects.toThrow(
      InvalidAssetInputError,
    );
    expect(repository.updateAsset).not.toHaveBeenCalled();
  });

  it("throws when no fields are provided", async () => {
    const existing = makeAsset();
    const repository = createFakeRepository({ getAsset: vi.fn().mockResolvedValue(existing) });
    const service = new AssetService(repository);

    await expect(service.updateAsset("asset-1", {})).rejects.toThrow(InvalidAssetInputError);
    expect(repository.updateAsset).not.toHaveBeenCalled();
  });
});

describe("AssetService.archiveAsset", () => {
  it("archives an existing asset", async () => {
    const existing = makeAsset();
    const archived = makeAsset({ archivedAt: "2026-07-20T00:00:00.000Z" });
    const repository = createFakeRepository({
      getAsset: vi.fn().mockResolvedValue(existing),
      archiveAsset: vi.fn().mockResolvedValue(archived),
    });
    const service = new AssetService(repository);

    await expect(service.archiveAsset("asset-1")).resolves.toBe(archived);
    expect(repository.archiveAsset).toHaveBeenCalledWith("asset-1");
  });

  it("throws AssetNotFoundError for a nonexistent asset without calling archiveAsset", async () => {
    const repository = createFakeRepository({ getAsset: vi.fn().mockResolvedValue(null) });
    const service = new AssetService(repository);

    await expect(service.archiveAsset("nonexistent")).rejects.toThrow(AssetNotFoundError);
    expect(repository.archiveAsset).not.toHaveBeenCalled();
  });
});

describe("AssetService.listAssets", () => {
  it("delegates to the repository with the given filter", async () => {
    const assets = [makeAsset()];
    const repository = createFakeRepository({ listAssets: vi.fn().mockResolvedValue(assets) });
    const service = new AssetService(repository);

    const result = await service.listAssets("estate-1", { category: "financial" });

    expect(repository.listAssets).toHaveBeenCalledWith("estate-1", { category: "financial" });
    expect(result).toBe(assets);
  });

  it("rejects an invalid category filter without calling the repository", async () => {
    const repository = createFakeRepository();
    const service = new AssetService(repository);

    await expect(
      service.listAssets("estate-1", { category: "not-a-category" as never }),
    ).rejects.toThrow(InvalidAssetInputError);
    expect(repository.listAssets).not.toHaveBeenCalled();
  });
});
