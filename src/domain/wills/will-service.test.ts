import { describe, expect, it, vi } from "vitest";
import type { Estate, EstateRepository } from "@/domain/estates/ports";
import type { DigitalAsset, DigitalAssetRepository } from "@/domain/assets/ports";
import type { Beneficiary, BeneficiaryRepository } from "@/domain/beneficiaries/ports";
import type { Document, DocumentRepository } from "@/domain/documents/ports";
import type { WillExecutionRequirement, WillExecutionRequirementRepository } from "@/domain/admin-will-execution-requirements/ports";
import type { Will, WillBequest, WillRepository, WillVersion } from "./ports";
import {
  InvalidWillInputError,
  WillAlreadyFinalizedError,
  WillNotFoundError,
  WillService,
} from "./will-service";

function makeEstate(overrides: Partial<Estate> = {}): Estate {
  return {
    id: "case-1",
    ownerUserId: "user-1",
    jurisdictionId: "jurisdiction-1",
    displayName: "Marcus Whitfield's Case",
    status: "active_living",
    checkInIntervalDays: 90,
    lastCheckInAt: "2026-08-05T00:00:00.000Z",
    gracePeriodDays: 14,
    verificationStartedAt: null,
    selfCancelWindowDays: 7,
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    closedAt: null,
    deceasedFullName: "Marcus Whitfield",
    deceasedDateOfBirth: "1980-05-01",
    deceasedRelationship: "Self",
    deceasedDateOfDeath: null,
    draftStep: null,
    draftPayload: {},
    isSelfPlanned: true,
    acquisitionBrand: "unknown",
    ...overrides,
  };
}

function makeWill(overrides: Partial<Will> = {}): Will {
  return {
    id: "will-1",
    caseId: "case-1",
    status: "draft",
    guardianFullName: null,
    guardianRelationship: null,
    alternateGuardianFullName: null,
    alternateGuardianRelationship: null,
    hasMinorChildren: false,
    residuaryBeneficiaryDescription: null,
    currentVersionId: null,
    executedAt: null,
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

function makeExecutionRequirement(overrides: Partial<WillExecutionRequirement> = {}): WillExecutionRequirement {
  return {
    id: "req-1",
    jurisdictionId: "jurisdiction-1",
    witnessCount: 2,
    notarizationRequired: false,
    selfProvingAffidavitAvailable: false,
    holographicWillsAllowed: false,
    executionInstructions: "Sign in front of two witnesses.",
    effectiveDate: "2026-08-05",
    supersededById: null,
    notes: null,
    pendingCounselReview: true,
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

function makeBequest(overrides: Partial<WillBequest> = {}): WillBequest {
  return {
    id: "bequest-1",
    willId: "will-1",
    bequestCategory: "digital_asset",
    digitalAssetId: null,
    beneficiaryId: null,
    description: "My coin collection",
    displayOrder: 0,
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    estateId: "case-1",
    uploadedByUserId: "user-1",
    documentType: "will",
    storagePath: "case-1/doc-1",
    fileName: "will-Marcus Whitfield.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 100,
    isCertifiedOriginal: false,
    notes: null,
    uploadedAt: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

function makeService(
  overrides: {
    willRepository?: Partial<WillRepository>;
    estateRepository?: Partial<EstateRepository>;
    executionRequirementRepository?: Partial<WillExecutionRequirementRepository>;
    digitalAssetRepository?: Partial<DigitalAssetRepository>;
    beneficiaryRepository?: Partial<BeneficiaryRepository>;
    documentRepository?: Partial<DocumentRepository>;
  } = {},
) {
  const willRepository = {
    getWillByCaseId: vi.fn().mockResolvedValue(null),
    createWill: vi.fn().mockResolvedValue(makeWill()),
    getWill: vi.fn().mockResolvedValue(makeWill()),
    updateGuardianInfo: vi.fn(),
    updateResiduaryClause: vi.fn(),
    listBequests: vi.fn().mockResolvedValue([]),
    createBequest: vi.fn(),
    updateBequest: vi.fn(),
    deleteBequest: vi.fn(),
    createVersion: vi.fn().mockResolvedValue({ id: "version-1", willId: "will-1", content: "content", generatedAt: "2026-08-05T00:00:00.000Z" } satisfies WillVersion),
    setStatus: vi.fn().mockResolvedValue(makeWill({ status: "ready_to_sign", currentVersionId: "version-1" })),
    listExecutors: vi.fn().mockResolvedValue([]),
    ...overrides.willRepository,
  } as WillRepository;

  const estateRepository = {
    getEstate: vi.fn().mockResolvedValue(makeEstate()),
    ...overrides.estateRepository,
  } as unknown as EstateRepository;

  const executionRequirementRepository = {
    listRequirements: vi.fn().mockResolvedValue([makeExecutionRequirement()]),
    ...overrides.executionRequirementRepository,
  } as unknown as WillExecutionRequirementRepository;

  const digitalAssetRepository = {
    getAsset: vi.fn().mockResolvedValue(null),
    ...overrides.digitalAssetRepository,
  } as unknown as DigitalAssetRepository;

  const beneficiaryRepository = {
    getBeneficiary: vi.fn().mockResolvedValue(null),
    ...overrides.beneficiaryRepository,
  } as unknown as BeneficiaryRepository;

  const documentRepository = {
    uploadDocument: vi.fn().mockResolvedValue(makeDocument()),
    ...overrides.documentRepository,
  } as unknown as DocumentRepository;

  return {
    service: new WillService(
      willRepository,
      estateRepository,
      executionRequirementRepository,
      digitalAssetRepository,
      beneficiaryRepository,
      documentRepository,
    ),
    willRepository,
    estateRepository,
    executionRequirementRepository,
    digitalAssetRepository,
    beneficiaryRepository,
    documentRepository,
  };
}

describe("WillService.getOrCreateWill", () => {
  it("creates a will when none exists yet, for a self-planned living case", async () => {
    const { service, willRepository } = makeService();

    const result = await service.getOrCreateWill("case-1");

    expect(willRepository.createWill).toHaveBeenCalledWith("case-1");
    expect(result.status).toBe("draft");
  });

  it("returns the existing will without creating a new one", async () => {
    const existing = makeWill({ status: "ready_to_sign" });
    const { service, willRepository } = makeService({ willRepository: { getWillByCaseId: vi.fn().mockResolvedValue(existing) } });

    const result = await service.getOrCreateWill("case-1");

    expect(willRepository.createWill).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });

  it("rejects a case that isn't self-planned", async () => {
    const { service } = makeService({ estateRepository: { getEstate: vi.fn().mockResolvedValue(makeEstate({ isSelfPlanned: false })) } });

    await expect(service.getOrCreateWill("case-1")).rejects.toThrow(InvalidWillInputError);
  });

  it("rejects a case that has moved past a living status", async () => {
    const { service } = makeService({ estateRepository: { getEstate: vi.fn().mockResolvedValue(makeEstate({ status: "death_reported" })) } });

    await expect(service.getOrCreateWill("case-1")).rejects.toThrow(InvalidWillInputError);
  });

  it("throws WillNotFoundError for a nonexistent case", async () => {
    const { service } = makeService({ estateRepository: { getEstate: vi.fn().mockResolvedValue(null) } });

    await expect(service.getOrCreateWill("nonexistent")).rejects.toThrow(WillNotFoundError);
  });
});

describe("WillService.createBequest", () => {
  it("creates a bequest linked to a digital asset", async () => {
    const { service, willRepository } = makeService();

    await service.createBequest("will-1", { bequestCategory: "digital_asset", digitalAssetId: "asset-1" });

    expect(willRepository.createBequest).toHaveBeenCalledWith(
      "will-1",
      expect.objectContaining({ bequestCategory: "digital_asset", digitalAssetId: "asset-1" }),
    );
  });

  it("creates a bequest with only a free-text description", async () => {
    const { service, willRepository } = makeService();

    await service.createBequest("will-1", { bequestCategory: "real_property", description: "My house at 123 Main St" });

    expect(willRepository.createBequest).toHaveBeenCalled();
  });

  it("rejects a bequest with no link and no description", async () => {
    const { service, willRepository } = makeService();

    await expect(service.createBequest("will-1", { bequestCategory: "vehicle" })).rejects.toThrow(
      InvalidWillInputError,
    );
    expect(willRepository.createBequest).not.toHaveBeenCalled();
  });

  it("rejects an invalid bequestCategory", async () => {
    const { service } = makeService();

    await expect(
      service.createBequest("will-1", { bequestCategory: "not-a-category", description: "something" }),
    ).rejects.toThrow(InvalidWillInputError);
  });
});

describe("WillService.generateDocument", () => {
  it("composes testator/executor/guardian/bequests/residuary/execution-requirements, stores a PDF, and moves status to ready_to_sign", async () => {
    const { service, willRepository, documentRepository } = makeService({
      willRepository: {
        getWill: vi.fn().mockResolvedValue(makeWill({ status: "draft" })),
        listExecutors: vi.fn().mockResolvedValue([{ displayName: "Jane Doe", inviteEmail: "jane@example.com", fallbackOrder: null }]),
        listBequests: vi.fn().mockResolvedValue([makeBequest()]),
      },
    });

    const result = await service.generateDocument("will-1", "case-1", "user-1");

    expect(willRepository.createVersion).toHaveBeenCalledWith("will-1", expect.stringContaining("Jane Doe"));
    expect(documentRepository.uploadDocument).toHaveBeenCalledWith(
      "case-1",
      "user-1",
      expect.objectContaining({ documentType: "will", mimeType: "application/pdf" }),
    );
    expect(willRepository.setStatus).toHaveBeenCalledWith("will-1", "ready_to_sign", { currentVersionId: "version-1" });
    expect(result.status).toBe("ready_to_sign");
  });

  it("resolves a linked digital asset's display name into the rendered content", async () => {
    const { service, willRepository } = makeService({
      willRepository: {
        listBequests: vi.fn().mockResolvedValue([makeBequest({ digitalAssetId: "asset-1", description: null })]),
      },
      digitalAssetRepository: {
        getAsset: vi.fn().mockResolvedValue({ customProviderName: "Chase Checking" } as DigitalAsset),
      },
    });

    await service.generateDocument("will-1", "case-1", "user-1");

    expect(willRepository.createVersion).toHaveBeenCalledWith("will-1", expect.stringContaining("Chase Checking"));
  });

  it("resolves a linked beneficiary's display name into the rendered content", async () => {
    const { service, willRepository } = makeService({
      willRepository: {
        listBequests: vi.fn().mockResolvedValue([makeBequest({ beneficiaryId: "beneficiary-1", description: null })]),
      },
      beneficiaryRepository: {
        getBeneficiary: vi.fn().mockResolvedValue({ displayName: "My Daughter" } as Beneficiary),
      },
    });

    await service.generateDocument("will-1", "case-1", "user-1");

    expect(willRepository.createVersion).toHaveBeenCalledWith("will-1", expect.stringContaining("My Daughter"));
  });

  it("refuses to generate when no execution requirements exist for the jurisdiction", async () => {
    const { service, willRepository } = makeService({
      executionRequirementRepository: { listRequirements: vi.fn().mockResolvedValue([]) },
    });

    await expect(service.generateDocument("will-1", "case-1", "user-1")).rejects.toThrow(InvalidWillInputError);
    expect(willRepository.createVersion).not.toHaveBeenCalled();
  });

  it("refuses to regenerate a revoked will", async () => {
    const { service, willRepository } = makeService({
      willRepository: { getWill: vi.fn().mockResolvedValue(makeWill({ status: "revoked" })) },
    });

    await expect(service.generateDocument("will-1", "case-1", "user-1")).rejects.toThrow(WillAlreadyFinalizedError);
    expect(willRepository.createVersion).not.toHaveBeenCalled();
  });

  it("allows regenerating an already-executed will (moves back to ready_to_sign, requiring a fresh signature)", async () => {
    const { service } = makeService({
      willRepository: { getWill: vi.fn().mockResolvedValue(makeWill({ status: "executed", executedAt: "2026-08-01T00:00:00.000Z" })) },
    });

    const result = await service.generateDocument("will-1", "case-1", "user-1");

    expect(result.status).toBe("ready_to_sign");
  });
});

describe("WillService.markExecuted", () => {
  it("marks a ready_to_sign will as executed", async () => {
    const { service, willRepository } = makeService({
      willRepository: {
        getWill: vi.fn().mockResolvedValue(makeWill({ status: "ready_to_sign" })),
        setStatus: vi.fn().mockResolvedValue(makeWill({ status: "executed", executedAt: "2026-08-05T01:00:00.000Z" })),
      },
    });

    const result = await service.markExecuted("will-1");

    expect(willRepository.setStatus).toHaveBeenCalledWith("will-1", "executed", { executedAt: expect.any(String) });
    expect(result.status).toBe("executed");
  });

  it("refuses to mark a draft will executed (no version generated yet)", async () => {
    const { service, willRepository } = makeService({
      willRepository: { getWill: vi.fn().mockResolvedValue(makeWill({ status: "draft" })) },
    });

    await expect(service.markExecuted("will-1")).rejects.toThrow(WillAlreadyFinalizedError);
    expect(willRepository.setStatus).not.toHaveBeenCalled();
  });
});

describe("WillService.revoke", () => {
  it("revokes a will", async () => {
    const { service, willRepository } = makeService({
      willRepository: { setStatus: vi.fn().mockResolvedValue(makeWill({ status: "revoked" })) },
    });

    const result = await service.revoke("will-1");

    expect(willRepository.setStatus).toHaveBeenCalledWith("will-1", "revoked");
    expect(result.status).toBe("revoked");
  });

  it("refuses to revoke an already-revoked will", async () => {
    const { service, willRepository } = makeService({
      willRepository: { getWill: vi.fn().mockResolvedValue(makeWill({ status: "revoked" })) },
    });

    await expect(service.revoke("will-1")).rejects.toThrow(WillAlreadyFinalizedError);
    expect(willRepository.setStatus).not.toHaveBeenCalled();
  });
});
