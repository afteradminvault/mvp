import { describe, expect, it, vi } from "vitest";
import type { DigitalAsset, DigitalAssetRepository } from "@/domain/assets/ports";
import type { Beneficiary, BeneficiaryRepository } from "./ports";
import {
  BeneficiaryForbiddenError,
  BeneficiaryNotFoundError,
  BeneficiaryService,
  InvalidBeneficiaryInputError,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_RELATIONSHIP_LENGTH,
} from "./beneficiary-service";

function createFakeRepository(overrides: Partial<BeneficiaryRepository> = {}): BeneficiaryRepository {
  return {
    createBeneficiary: vi.fn(),
    getBeneficiary: vi.fn(),
    updateBeneficiary: vi.fn(),
    deleteBeneficiary: vi.fn(),
    listBeneficiaries: vi.fn(),
    ...overrides,
  };
}

function createFakeAssetRepository(overrides: Partial<DigitalAssetRepository> = {}): DigitalAssetRepository {
  return {
    createAsset: vi.fn(),
    getAsset: vi.fn(),
    updateAsset: vi.fn(),
    archiveAsset: vi.fn(),
    listAssets: vi.fn(),
    ...overrides,
  };
}

function makeBeneficiary(overrides: Partial<Beneficiary> = {}): Beneficiary {
  return {
    id: "beneficiary-1",
    estateId: "estate-1",
    digitalAssetId: null,
    displayName: "Diane Smith",
    relationship: "daughter",
    contactEmail: "diane@example.com",
    linkedUserId: null,
    notes: null,
    createdAt: "2026-07-24T00:00:00.000Z",
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
    accountIdentifier: null,
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

describe("BeneficiaryService.createBeneficiary", () => {
  it("creates an estate-wide beneficiary when digitalAssetId is omitted", async () => {
    const beneficiary = makeBeneficiary();
    const repository = createFakeRepository({ createBeneficiary: vi.fn().mockResolvedValue(beneficiary) });
    const assetRepository = createFakeAssetRepository();
    const service = new BeneficiaryService(repository, assetRepository);

    const result = await service.createBeneficiary("estate-1", {
      displayName: "Diane Smith",
      relationship: "daughter",
      contactEmail: "diane@example.com",
    });

    expect(repository.createBeneficiary).toHaveBeenCalledWith("estate-1", {
      digitalAssetId: null,
      displayName: "Diane Smith",
      relationship: "daughter",
      contactEmail: "diane@example.com",
      notes: null,
    });
    expect(assetRepository.getAsset).not.toHaveBeenCalled();
    expect(result).toBe(beneficiary);
  });

  it("creates an asset-linked beneficiary when the asset belongs to the same estate", async () => {
    const beneficiary = makeBeneficiary({ digitalAssetId: "asset-1" });
    const repository = createFakeRepository({ createBeneficiary: vi.fn().mockResolvedValue(beneficiary) });
    const assetRepository = createFakeAssetRepository({ getAsset: vi.fn().mockResolvedValue(makeAsset()) });
    const service = new BeneficiaryService(repository, assetRepository);

    await service.createBeneficiary("estate-1", { displayName: "Diane Smith", digitalAssetId: "asset-1" });

    expect(assetRepository.getAsset).toHaveBeenCalledWith("asset-1");
    expect(repository.createBeneficiary).toHaveBeenCalledWith(
      "estate-1",
      expect.objectContaining({ digitalAssetId: "asset-1" }),
    );
  });

  it("rejects a digitalAssetId belonging to a different estate", async () => {
    const repository = createFakeRepository();
    const assetRepository = createFakeAssetRepository({
      getAsset: vi.fn().mockResolvedValue(makeAsset({ estateId: "some-other-estate" })),
    });
    const service = new BeneficiaryService(repository, assetRepository);

    await expect(
      service.createBeneficiary("estate-1", { displayName: "Diane Smith", digitalAssetId: "asset-1" }),
    ).rejects.toThrow(InvalidBeneficiaryInputError);
    expect(repository.createBeneficiary).not.toHaveBeenCalled();
  });

  it("rejects a digitalAssetId that doesn't exist", async () => {
    const repository = createFakeRepository();
    const assetRepository = createFakeAssetRepository({ getAsset: vi.fn().mockResolvedValue(null) });
    const service = new BeneficiaryService(repository, assetRepository);

    await expect(
      service.createBeneficiary("estate-1", { displayName: "Diane Smith", digitalAssetId: "asset-1" }),
    ).rejects.toThrow(InvalidBeneficiaryInputError);
  });

  it("rejects a missing displayName", async () => {
    const repository = createFakeRepository();
    const service = new BeneficiaryService(repository, createFakeAssetRepository());

    await expect(service.createBeneficiary("estate-1", {})).rejects.toThrow(InvalidBeneficiaryInputError);
    expect(repository.createBeneficiary).not.toHaveBeenCalled();
  });

  it("rejects a blank displayName", async () => {
    const repository = createFakeRepository();
    const service = new BeneficiaryService(repository, createFakeAssetRepository());

    await expect(service.createBeneficiary("estate-1", { displayName: "   " })).rejects.toThrow(
      InvalidBeneficiaryInputError,
    );
  });

  it(`rejects a displayName longer than ${MAX_DISPLAY_NAME_LENGTH} characters`, async () => {
    const repository = createFakeRepository();
    const service = new BeneficiaryService(repository, createFakeAssetRepository());

    await expect(
      service.createBeneficiary("estate-1", { displayName: "x".repeat(MAX_DISPLAY_NAME_LENGTH + 1) }),
    ).rejects.toThrow(InvalidBeneficiaryInputError);
  });

  it(`rejects a relationship longer than ${MAX_RELATIONSHIP_LENGTH} characters`, async () => {
    const repository = createFakeRepository();
    const service = new BeneficiaryService(repository, createFakeAssetRepository());

    await expect(
      service.createBeneficiary("estate-1", {
        displayName: "Diane Smith",
        relationship: "x".repeat(MAX_RELATIONSHIP_LENGTH + 1),
      }),
    ).rejects.toThrow(InvalidBeneficiaryInputError);
  });

  it(`rejects notes longer than ${MAX_NOTES_LENGTH} characters`, async () => {
    const repository = createFakeRepository();
    const service = new BeneficiaryService(repository, createFakeAssetRepository());

    await expect(
      service.createBeneficiary("estate-1", {
        displayName: "Diane Smith",
        notes: "x".repeat(MAX_NOTES_LENGTH + 1),
      }),
    ).rejects.toThrow(InvalidBeneficiaryInputError);
  });

  it("rejects a malformed contactEmail", async () => {
    const repository = createFakeRepository();
    const service = new BeneficiaryService(repository, createFakeAssetRepository());

    await expect(
      service.createBeneficiary("estate-1", { displayName: "Diane Smith", contactEmail: "not-an-email" }),
    ).rejects.toThrow(InvalidBeneficiaryInputError);
  });

  it("translates an RLS denial into BeneficiaryForbiddenError", async () => {
    const repository = createFakeRepository({
      createBeneficiary: vi.fn().mockRejectedValue(new Error("new row violates row-level security policy")),
    });
    const service = new BeneficiaryService(repository, createFakeAssetRepository());

    await expect(service.createBeneficiary("estate-1", { displayName: "Diane Smith" })).rejects.toThrow(
      BeneficiaryForbiddenError,
    );
  });
});

describe("BeneficiaryService.getBeneficiary", () => {
  it("returns the beneficiary when found", async () => {
    const beneficiary = makeBeneficiary();
    const repository = createFakeRepository({ getBeneficiary: vi.fn().mockResolvedValue(beneficiary) });
    const service = new BeneficiaryService(repository, createFakeAssetRepository());

    await expect(service.getBeneficiary("beneficiary-1")).resolves.toBe(beneficiary);
  });

  it("throws BeneficiaryNotFoundError when not found", async () => {
    const repository = createFakeRepository({ getBeneficiary: vi.fn().mockResolvedValue(null) });
    const service = new BeneficiaryService(repository, createFakeAssetRepository());

    await expect(service.getBeneficiary("nonexistent")).rejects.toThrow(BeneficiaryNotFoundError);
  });
});

describe("BeneficiaryService.updateBeneficiary", () => {
  it("only forwards fields that were provided", async () => {
    const updated = makeBeneficiary({ displayName: "Diane S." });
    const repository = createFakeRepository({ updateBeneficiary: vi.fn().mockResolvedValue(updated) });
    const assetRepository = createFakeAssetRepository();
    const service = new BeneficiaryService(repository, assetRepository);

    await service.updateBeneficiary("estate-1", "beneficiary-1", { displayName: "Diane S." });

    expect(repository.updateBeneficiary).toHaveBeenCalledWith("beneficiary-1", { displayName: "Diane S." });
    expect(assetRepository.getAsset).not.toHaveBeenCalled();
  });

  it("re-validates digitalAssetId against the estate when it's part of the patch", async () => {
    const repository = createFakeRepository({ updateBeneficiary: vi.fn().mockResolvedValue(makeBeneficiary()) });
    const assetRepository = createFakeAssetRepository({
      getAsset: vi.fn().mockResolvedValue(makeAsset({ estateId: "some-other-estate" })),
    });
    const service = new BeneficiaryService(repository, assetRepository);

    await expect(
      service.updateBeneficiary("estate-1", "beneficiary-1", { digitalAssetId: "asset-1" }),
    ).rejects.toThrow(InvalidBeneficiaryInputError);
    expect(repository.updateBeneficiary).not.toHaveBeenCalled();
  });

  it("allows clearing digitalAssetId to null (estate-wide)", async () => {
    const updated = makeBeneficiary({ digitalAssetId: null });
    const repository = createFakeRepository({ updateBeneficiary: vi.fn().mockResolvedValue(updated) });
    const assetRepository = createFakeAssetRepository();
    const service = new BeneficiaryService(repository, assetRepository);

    await service.updateBeneficiary("estate-1", "beneficiary-1", { digitalAssetId: null });

    expect(repository.updateBeneficiary).toHaveBeenCalledWith("beneficiary-1", { digitalAssetId: null });
    expect(assetRepository.getAsset).not.toHaveBeenCalled();
  });

  it("allows clearing relationship, contactEmail, and notes to null", async () => {
    const updated = makeBeneficiary({ relationship: null, contactEmail: null, notes: null });
    const repository = createFakeRepository({ updateBeneficiary: vi.fn().mockResolvedValue(updated) });
    const service = new BeneficiaryService(repository, createFakeAssetRepository());

    await service.updateBeneficiary("estate-1", "beneficiary-1", {
      relationship: null,
      contactEmail: null,
      notes: null,
    });

    expect(repository.updateBeneficiary).toHaveBeenCalledWith("beneficiary-1", {
      relationship: null,
      contactEmail: null,
      notes: null,
    });
  });

  it("rejects clearing displayName to null (not nullable, unlike the other fields)", async () => {
    const repository = createFakeRepository();
    const service = new BeneficiaryService(repository, createFakeAssetRepository());

    await expect(
      service.updateBeneficiary("estate-1", "beneficiary-1", { displayName: null }),
    ).rejects.toThrow(InvalidBeneficiaryInputError);
    expect(repository.updateBeneficiary).not.toHaveBeenCalled();
  });

  it("throws when no fields are provided", async () => {
    const repository = createFakeRepository();
    const service = new BeneficiaryService(repository, createFakeAssetRepository());

    await expect(service.updateBeneficiary("estate-1", "beneficiary-1", {})).rejects.toThrow(
      InvalidBeneficiaryInputError,
    );
    expect(repository.updateBeneficiary).not.toHaveBeenCalled();
  });

  it("translates an RLS denial into BeneficiaryForbiddenError", async () => {
    const repository = createFakeRepository({
      updateBeneficiary: vi.fn().mockRejectedValue(new Error("permission denied for table beneficiaries")),
    });
    const service = new BeneficiaryService(repository, createFakeAssetRepository());

    await expect(
      service.updateBeneficiary("estate-1", "beneficiary-1", { displayName: "New Name" }),
    ).rejects.toThrow(BeneficiaryForbiddenError);
  });
});

describe("BeneficiaryService.deleteBeneficiary", () => {
  it("deletes the beneficiary", async () => {
    const repository = createFakeRepository();
    const service = new BeneficiaryService(repository, createFakeAssetRepository());

    await service.deleteBeneficiary("beneficiary-1");

    expect(repository.deleteBeneficiary).toHaveBeenCalledWith("beneficiary-1");
  });

  it("translates an RLS denial into BeneficiaryForbiddenError", async () => {
    const repository = createFakeRepository({
      deleteBeneficiary: vi.fn().mockRejectedValue(new Error("row-level security policy violation")),
    });
    const service = new BeneficiaryService(repository, createFakeAssetRepository());

    await expect(service.deleteBeneficiary("beneficiary-1")).rejects.toThrow(BeneficiaryForbiddenError);
  });
});

describe("BeneficiaryService.listBeneficiaries", () => {
  it("delegates to the repository", async () => {
    const beneficiaries = [makeBeneficiary()];
    const repository = createFakeRepository({ listBeneficiaries: vi.fn().mockResolvedValue(beneficiaries) });
    const service = new BeneficiaryService(repository, createFakeAssetRepository());

    const result = await service.listBeneficiaries("estate-1");

    expect(repository.listBeneficiaries).toHaveBeenCalledWith("estate-1");
    expect(result).toBe(beneficiaries);
  });
});
