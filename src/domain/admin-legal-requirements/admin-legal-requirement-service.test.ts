import { describe, expect, it, vi } from "vitest";
import type { LegalRequirement, LegalRequirementContentInput, LegalRequirementRepository } from "./ports";
import {
  AdminLegalRequirementService,
  InvalidLegalRequirementInputError,
  LegalRequirementAlreadySupersededError,
  LegalRequirementForbiddenError,
  LegalRequirementNotFoundError,
} from "./admin-legal-requirement-service";

function createFakeRepository(overrides: Partial<LegalRequirementRepository> = {}): LegalRequirementRepository {
  return {
    createRequirement: vi.fn(),
    listRequirements: vi.fn(),
    getRequirement: vi.fn(),
    reviseRequirement: vi.fn(),
    ...overrides,
  };
}

function makeRequirement(overrides: Partial<LegalRequirement> = {}): LegalRequirement {
  return {
    id: "req-1",
    jurisdictionId: "jurisdiction-1",
    assetCategory: "financial",
    providerId: null,
    requirementType: "death_certificate_certified",
    submissionChannel: "mail",
    submissionDetail: null,
    displayOrder: 0,
    effectiveDate: "2026-07-22",
    supersededById: null,
    notes: null,
    pendingCounselReview: false,
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
    ...overrides,
  };
}

function makeContentInput(overrides: Partial<LegalRequirementContentInput> = {}): LegalRequirementContentInput {
  return {
    jurisdictionId: "jurisdiction-1",
    assetCategory: "financial",
    requirementType: "death_certificate_certified",
    submissionChannel: "mail",
    ...overrides,
  };
}

describe("AdminLegalRequirementService.createRequirement", () => {
  it("creates a requirement with valid content, defaulting displayOrder and pendingCounselReview", async () => {
    const requirement = makeRequirement();
    const repository = createFakeRepository({ createRequirement: vi.fn().mockResolvedValue(requirement) });
    const service = new AdminLegalRequirementService(repository);

    await service.createRequirement(makeContentInput());

    expect(repository.createRequirement).toHaveBeenCalledWith({
      jurisdictionId: "jurisdiction-1",
      assetCategory: "financial",
      providerId: null,
      requirementType: "death_certificate_certified",
      submissionChannel: "mail",
      submissionDetail: null,
      displayOrder: 0,
      notes: null,
      pendingCounselReview: false,
    });
  });

  it("rejects a missing jurisdictionId", async () => {
    const repository = createFakeRepository();
    const service = new AdminLegalRequirementService(repository);

    await expect(
      service.createRequirement(makeContentInput({ jurisdictionId: "" })),
    ).rejects.toThrow(InvalidLegalRequirementInputError);
  });

  it("rejects an invalid assetCategory", async () => {
    const repository = createFakeRepository();
    const service = new AdminLegalRequirementService(repository);

    await expect(
      service.createRequirement(makeContentInput({ assetCategory: "not-a-category" as never })),
    ).rejects.toThrow(InvalidLegalRequirementInputError);
  });

  it("rejects an invalid requirementType", async () => {
    const repository = createFakeRepository();
    const service = new AdminLegalRequirementService(repository);

    await expect(
      service.createRequirement(makeContentInput({ requirementType: "not-a-type" as never })),
    ).rejects.toThrow(InvalidLegalRequirementInputError);
  });

  it("rejects an invalid submissionChannel", async () => {
    const repository = createFakeRepository();
    const service = new AdminLegalRequirementService(repository);

    await expect(
      service.createRequirement(makeContentInput({ submissionChannel: "carrier-pigeon" as never })),
    ).rejects.toThrow(InvalidLegalRequirementInputError);
  });

  it("rejects a negative displayOrder", async () => {
    const repository = createFakeRepository();
    const service = new AdminLegalRequirementService(repository);

    await expect(
      service.createRequirement(makeContentInput({ displayOrder: -1 })),
    ).rejects.toThrow(InvalidLegalRequirementInputError);
  });

  it("preserves an explicit pendingCounselReview flag", async () => {
    const requirement = makeRequirement({ pendingCounselReview: true });
    const repository = createFakeRepository({ createRequirement: vi.fn().mockResolvedValue(requirement) });
    const service = new AdminLegalRequirementService(repository);

    await service.createRequirement(makeContentInput({ pendingCounselReview: true }));

    expect(repository.createRequirement).toHaveBeenCalledWith(
      expect.objectContaining({ pendingCounselReview: true }),
    );
  });

  it("translates a repository forbidden error", async () => {
    const repository = createFakeRepository({
      createRequirement: vi.fn().mockRejectedValue(new Error("new row violates row-level security policy")),
    });
    const service = new AdminLegalRequirementService(repository);

    await expect(service.createRequirement(makeContentInput())).rejects.toThrow(LegalRequirementForbiddenError);
  });
});

describe("AdminLegalRequirementService.listRequirements", () => {
  it("delegates to the repository with the given filter", async () => {
    const requirements = [makeRequirement()];
    const repository = createFakeRepository({ listRequirements: vi.fn().mockResolvedValue(requirements) });
    const service = new AdminLegalRequirementService(repository);

    const result = await service.listRequirements({ jurisdictionId: "jurisdiction-1" });

    expect(repository.listRequirements).toHaveBeenCalledWith({ jurisdictionId: "jurisdiction-1" });
    expect(result).toBe(requirements);
  });

  it("rejects an invalid assetCategory filter without calling the repository", async () => {
    const repository = createFakeRepository();
    const service = new AdminLegalRequirementService(repository);

    await expect(
      service.listRequirements({ assetCategory: "not-a-category" as never }),
    ).rejects.toThrow(InvalidLegalRequirementInputError);
    expect(repository.listRequirements).not.toHaveBeenCalled();
  });
});

describe("AdminLegalRequirementService.reviseRequirement", () => {
  it("creates a new version and links the old row to it (never mutates in place)", async () => {
    const existing = makeRequirement();
    const revised = makeRequirement({ id: "req-2", notes: "updated" });
    const repository = createFakeRepository({
      getRequirement: vi.fn().mockResolvedValue(existing),
      reviseRequirement: vi.fn().mockResolvedValue(revised),
    });
    const service = new AdminLegalRequirementService(repository);

    const result = await service.reviseRequirement("req-1", makeContentInput({ notes: "updated" }));

    expect(repository.reviseRequirement).toHaveBeenCalledWith(
      "req-1",
      expect.objectContaining({ notes: "updated" }),
    );
    expect(result).toBe(revised);
  });

  it("throws LegalRequirementNotFoundError for a nonexistent id without calling reviseRequirement", async () => {
    const repository = createFakeRepository({ getRequirement: vi.fn().mockResolvedValue(null) });
    const service = new AdminLegalRequirementService(repository);

    await expect(service.reviseRequirement("nonexistent", makeContentInput())).rejects.toThrow(
      LegalRequirementNotFoundError,
    );
    expect(repository.reviseRequirement).not.toHaveBeenCalled();
  });

  it("throws LegalRequirementAlreadySupersededError when the existing row is already superseded", async () => {
    const existing = makeRequirement({ supersededById: "req-2" });
    const repository = createFakeRepository({ getRequirement: vi.fn().mockResolvedValue(existing) });
    const service = new AdminLegalRequirementService(repository);

    await expect(service.reviseRequirement("req-1", makeContentInput())).rejects.toThrow(
      LegalRequirementAlreadySupersededError,
    );
    expect(repository.reviseRequirement).not.toHaveBeenCalled();
  });

  it("validates the revised content before touching the repository", async () => {
    const existing = makeRequirement();
    const repository = createFakeRepository({ getRequirement: vi.fn().mockResolvedValue(existing) });
    const service = new AdminLegalRequirementService(repository);

    await expect(
      service.reviseRequirement("req-1", makeContentInput({ requirementType: "not-a-type" as never })),
    ).rejects.toThrow(InvalidLegalRequirementInputError);
    expect(repository.getRequirement).not.toHaveBeenCalled();
  });
});
