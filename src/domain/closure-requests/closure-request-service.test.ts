import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DigitalAsset, DigitalAssetRepository } from "@/domain/assets/ports";
import type { Estate, EstateRepository } from "@/domain/estates/ports";
import type { LegalRequirement, LegalRequirementRepository } from "@/domain/admin-legal-requirements/ports";
import type { AccountClosureRequest, ClosureRequestRepository } from "./ports";
import {
  ClosureRequestForbiddenError,
  ClosureRequestNotFoundError,
  ClosureRequestService,
  InvalidClosureRequestInputError,
} from "./closure-request-service";

function makeAsset(overrides: Partial<DigitalAsset> = {}): DigitalAsset {
  return {
    id: "asset-1",
    estateId: "estate-1",
    category: "financial",
    providerId: "provider-chase",
    customProviderName: null,
    accountIdentifier: null,
    intendedOutcome: "close",
    intendedOutcomeNotes: null,
    estimatedValueCents: null,
    currency: null,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

function makeEstate(overrides: Partial<Estate> = {}): Estate {
  return {
    id: "estate-1",
    ownerUserId: "owner-1",
    jurisdictionId: "jurisdiction-us",
    displayName: "Diane's Estate",
    status: "active_executor",
    checkInIntervalDays: 90,
    lastCheckInAt: "2026-07-25T00:00:00.000Z",
    gracePeriodDays: 14,
    verificationStartedAt: null,
    selfCancelWindowDays: 7,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    closedAt: null,
    deceasedFullName: null,
    deceasedDateOfBirth: null,
    deceasedRelationship: null,
    deceasedDateOfDeath: null,
    draftStep: null,
    draftPayload: {},
    isSelfPlanned: false,
    ...overrides,
  };
}

function makeRequirement(overrides: Partial<LegalRequirement> = {}): LegalRequirement {
  return {
    id: "req-1",
    jurisdictionId: "jurisdiction-us",
    assetCategory: "financial",
    providerId: null,
    requirementType: "death_certificate_certified",
    submissionChannel: "mail",
    submissionDetail: null,
    displayOrder: 0,
    effectiveDate: "2020-01-01",
    supersededById: null,
    notes: null,
    pendingCounselReview: false,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    ...overrides,
  };
}

function makeClosureRequest(overrides: Partial<AccountClosureRequest> = {}): AccountClosureRequest {
  return {
    id: "request-1",
    digitalAssetId: "asset-1",
    estateId: "estate-1",
    status: "not_started",
    assignedToUserId: null,
    legalRequirementSnapshot: [],
    lastStatusChangeAt: "2026-07-25T00:00:00.000Z",
    resolvedAt: null,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    ...overrides,
  };
}

function createFakeClosureRequestRepository(overrides: Partial<ClosureRequestRepository> = {}): ClosureRequestRepository {
  return {
    createClosureRequest: vi.fn(),
    getClosureRequest: vi.fn(),
    listClosureRequests: vi.fn(),
    updateClosureRequest: vi.fn(),
    getDocumentEstateId: vi.fn(),
    attachDocument: vi.fn(),
    markStaleRequestsNeedingNudge: vi.fn(),
    ...overrides,
  };
}

describe("ClosureRequestService", () => {
  let repository: ClosureRequestRepository;
  let assetRepository: DigitalAssetRepository;
  let estateRepository: EstateRepository;
  let legalRequirementRepository: LegalRequirementRepository;

  beforeEach(() => {
    repository = createFakeClosureRequestRepository({
      createClosureRequest: vi.fn().mockResolvedValue(makeClosureRequest()),
    });
    assetRepository = {
      createAsset: vi.fn(),
      getAsset: vi.fn().mockResolvedValue(makeAsset()),
      updateAsset: vi.fn(),
      archiveAsset: vi.fn(),
      listAssets: vi.fn(),
    };
    estateRepository = {
      createEstate: vi.fn(),
      getEstate: vi.fn().mockResolvedValue(makeEstate()),
      updateEstate: vi.fn(),
      recordCheckIn: vi.fn(),
      listMyEstates: vi.fn(),
      listSupportedJurisdictions: vi.fn(),
      createDraftCase: vi.fn(),
      saveDraftProgress: vi.fn(),
      activateDraftCase: vi.fn(),
    };
    legalRequirementRepository = {
      createRequirement: vi.fn(),
      listRequirements: vi.fn().mockResolvedValue([]),
      getRequirement: vi.fn(),
      reviseRequirement: vi.fn(),
    };
  });

  function makeService(): ClosureRequestService {
    return new ClosureRequestService(repository, assetRepository, estateRepository, legalRequirementRepository);
  }

  describe("createClosureRequest", () => {
    it("throws ClosureRequestNotFoundError when the asset doesn't belong to this estate", async () => {
      assetRepository.getAsset = vi.fn().mockResolvedValue(makeAsset({ estateId: "other-estate" }));
      const service = makeService();
      await expect(service.createClosureRequest("estate-1", "asset-1")).rejects.toThrow(ClosureRequestNotFoundError);
    });

    it("includes a generic (providerId null) requirement regardless of the asset's provider", async () => {
      legalRequirementRepository.listRequirements = vi
        .fn()
        .mockResolvedValue([makeRequirement({ providerId: null })]);
      const service = makeService();
      await service.createClosureRequest("estate-1", "asset-1");
      expect(repository.createClosureRequest).toHaveBeenCalledWith(
        "estate-1",
        "asset-1",
        expect.arrayContaining([expect.objectContaining({ id: "req-1" })]),
      );
    });

    it("includes a provider-specific requirement matching the asset's provider", async () => {
      legalRequirementRepository.listRequirements = vi
        .fn()
        .mockResolvedValue([makeRequirement({ id: "req-provider", providerId: "provider-chase" })]);
      const service = makeService();
      await service.createClosureRequest("estate-1", "asset-1");
      const snapshot = (repository.createClosureRequest as ReturnType<typeof vi.fn>).mock.calls[0][2];
      expect(snapshot.map((r: { id: string }) => r.id)).toContain("req-provider");
    });

    it("excludes a requirement specific to a different provider", async () => {
      legalRequirementRepository.listRequirements = vi
        .fn()
        .mockResolvedValue([makeRequirement({ id: "req-other-provider", providerId: "provider-coinbase" })]);
      const service = makeService();
      await service.createClosureRequest("estate-1", "asset-1");
      const snapshot = (repository.createClosureRequest as ReturnType<typeof vi.fn>).mock.calls[0][2];
      expect(snapshot).toHaveLength(0);
    });

    it("excludes a requirement whose effective_date is in the future", async () => {
      legalRequirementRepository.listRequirements = vi
        .fn()
        .mockResolvedValue([makeRequirement({ id: "req-future", effectiveDate: "2099-01-01" })]);
      const service = makeService();
      await service.createClosureRequest("estate-1", "asset-1");
      const snapshot = (repository.createClosureRequest as ReturnType<typeof vi.fn>).mock.calls[0][2];
      expect(snapshot).toHaveLength(0);
    });

    it("sorts the snapshot by displayOrder", async () => {
      legalRequirementRepository.listRequirements = vi.fn().mockResolvedValue([
        makeRequirement({ id: "second", displayOrder: 2 }),
        makeRequirement({ id: "first", displayOrder: 0 }),
      ]);
      const service = makeService();
      await service.createClosureRequest("estate-1", "asset-1");
      const snapshot = (repository.createClosureRequest as ReturnType<typeof vi.fn>).mock.calls[0][2];
      expect(snapshot.map((r: { id: string }) => r.id)).toEqual(["first", "second"]);
    });

    it("translates an RLS denial into ClosureRequestForbiddenError", async () => {
      repository.createClosureRequest = vi
        .fn()
        .mockRejectedValue(new Error('new row violates row-level security policy for table "..."'));
      const service = makeService();
      await expect(service.createClosureRequest("estate-1", "asset-1")).rejects.toThrow(ClosureRequestForbiddenError);
    });
  });

  describe("updateClosureRequest", () => {
    it("throws InvalidClosureRequestInputError when no fields are provided", async () => {
      const service = makeService();
      await expect(service.updateClosureRequest("request-1", {})).rejects.toThrow(InvalidClosureRequestInputError);
    });

    it("rejects an invalid status", async () => {
      const service = makeService();
      await expect(
        service.updateClosureRequest("request-1", { status: "not-a-real-status" }),
      ).rejects.toThrow(InvalidClosureRequestInputError);
    });

    it("allows unassigning via null", async () => {
      repository.updateClosureRequest = vi.fn().mockResolvedValue(makeClosureRequest({ assignedToUserId: null }));
      const service = makeService();
      await service.updateClosureRequest("request-1", { assignedToUserId: null });
      expect(repository.updateClosureRequest).toHaveBeenCalledWith("request-1", { assignedToUserId: null });
    });
  });

  describe("attachDocument", () => {
    beforeEach(() => {
      repository.getClosureRequest = vi.fn().mockResolvedValue(makeClosureRequest({ estateId: "estate-1" }));
    });

    it("rejects a document belonging to a different estate", async () => {
      repository.getDocumentEstateId = vi.fn().mockResolvedValue("other-estate");
      const service = makeService();
      await expect(service.attachDocument("request-1", "doc-1")).rejects.toThrow(InvalidClosureRequestInputError);
      expect(repository.attachDocument).not.toHaveBeenCalled();
    });

    it("throws ClosureRequestNotFoundError when the document doesn't exist", async () => {
      repository.getDocumentEstateId = vi.fn().mockResolvedValue(null);
      const service = makeService();
      await expect(service.attachDocument("request-1", "doc-1")).rejects.toThrow(ClosureRequestNotFoundError);
    });

    it("attaches when the document belongs to the same estate", async () => {
      repository.getDocumentEstateId = vi.fn().mockResolvedValue("estate-1");
      repository.attachDocument = vi.fn().mockResolvedValue(undefined);
      const service = makeService();
      await service.attachDocument("request-1", "doc-1");
      expect(repository.attachDocument).toHaveBeenCalledWith("request-1", "doc-1");
    });
  });
});
