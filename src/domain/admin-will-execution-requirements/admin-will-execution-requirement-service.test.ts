import { describe, expect, it, vi } from "vitest";
import type {
  WillExecutionRequirement,
  WillExecutionRequirementContentInput,
  WillExecutionRequirementRepository,
} from "./ports";
import {
  AdminWillExecutionRequirementService,
  InvalidWillExecutionRequirementInputError,
  WillExecutionRequirementAlreadySupersededError,
  WillExecutionRequirementForbiddenError,
  WillExecutionRequirementNotFoundError,
} from "./admin-will-execution-requirement-service";

function createFakeRepository(
  overrides: Partial<WillExecutionRequirementRepository> = {},
): WillExecutionRequirementRepository {
  return {
    createRequirement: vi.fn(),
    listRequirements: vi.fn(),
    getRequirement: vi.fn(),
    reviseRequirement: vi.fn(),
    ...overrides,
  };
}

function makeRequirement(overrides: Partial<WillExecutionRequirement> = {}): WillExecutionRequirement {
  return {
    id: "req-1",
    jurisdictionId: "jurisdiction-1",
    witnessCount: 2,
    notarizationRequired: false,
    selfProvingAffidavitAvailable: false,
    holographicWillsAllowed: false,
    executionInstructions: "Sign in front of two witnesses; store the original.",
    effectiveDate: "2026-08-05",
    supersededById: null,
    notes: null,
    pendingCounselReview: true,
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

function makeContentInput(
  overrides: Partial<WillExecutionRequirementContentInput> = {},
): WillExecutionRequirementContentInput {
  return {
    jurisdictionId: "jurisdiction-1",
    executionInstructions: "Sign in front of two witnesses; store the original.",
    ...overrides,
  };
}

describe("AdminWillExecutionRequirementService.createRequirement", () => {
  it("creates a requirement with valid content, defaulting witnessCount=2 and pendingCounselReview=true", async () => {
    const requirement = makeRequirement();
    const repository = createFakeRepository({ createRequirement: vi.fn().mockResolvedValue(requirement) });
    const service = new AdminWillExecutionRequirementService(repository);

    await service.createRequirement(makeContentInput());

    expect(repository.createRequirement).toHaveBeenCalledWith({
      jurisdictionId: "jurisdiction-1",
      witnessCount: 2,
      notarizationRequired: false,
      selfProvingAffidavitAvailable: false,
      holographicWillsAllowed: false,
      executionInstructions: "Sign in front of two witnesses; store the original.",
      notes: null,
      pendingCounselReview: true,
    });
  });

  it("rejects a missing jurisdictionId", async () => {
    const repository = createFakeRepository();
    const service = new AdminWillExecutionRequirementService(repository);

    await expect(service.createRequirement(makeContentInput({ jurisdictionId: "" }))).rejects.toThrow(
      InvalidWillExecutionRequirementInputError,
    );
  });

  it("rejects blank executionInstructions", async () => {
    const repository = createFakeRepository();
    const service = new AdminWillExecutionRequirementService(repository);

    await expect(service.createRequirement(makeContentInput({ executionInstructions: "  " }))).rejects.toThrow(
      InvalidWillExecutionRequirementInputError,
    );
  });

  it("rejects a negative witnessCount", async () => {
    const repository = createFakeRepository();
    const service = new AdminWillExecutionRequirementService(repository);

    await expect(service.createRequirement(makeContentInput({ witnessCount: -1 }))).rejects.toThrow(
      InvalidWillExecutionRequirementInputError,
    );
  });

  it("allows explicitly setting pendingCounselReview=false once real content has been reviewed", async () => {
    const requirement = makeRequirement({ pendingCounselReview: false });
    const repository = createFakeRepository({ createRequirement: vi.fn().mockResolvedValue(requirement) });
    const service = new AdminWillExecutionRequirementService(repository);

    await service.createRequirement(makeContentInput({ pendingCounselReview: false }));

    expect(repository.createRequirement).toHaveBeenCalledWith(
      expect.objectContaining({ pendingCounselReview: false }),
    );
  });

  it("translates a repository forbidden error", async () => {
    const repository = createFakeRepository({
      createRequirement: vi.fn().mockRejectedValue(new Error("new row violates row-level security policy")),
    });
    const service = new AdminWillExecutionRequirementService(repository);

    await expect(service.createRequirement(makeContentInput())).rejects.toThrow(
      WillExecutionRequirementForbiddenError,
    );
  });
});

describe("AdminWillExecutionRequirementService.listRequirements", () => {
  it("delegates to the repository with the given filter", async () => {
    const requirements = [makeRequirement()];
    const repository = createFakeRepository({ listRequirements: vi.fn().mockResolvedValue(requirements) });
    const service = new AdminWillExecutionRequirementService(repository);

    const result = await service.listRequirements({ jurisdictionId: "jurisdiction-1" });

    expect(repository.listRequirements).toHaveBeenCalledWith({ jurisdictionId: "jurisdiction-1" });
    expect(result).toBe(requirements);
  });
});

describe("AdminWillExecutionRequirementService.reviseRequirement", () => {
  it("creates a new version and links the old row to it (never mutates in place)", async () => {
    const existing = makeRequirement();
    const revised = makeRequirement({ id: "req-2", notes: "updated" });
    const repository = createFakeRepository({
      getRequirement: vi.fn().mockResolvedValue(existing),
      reviseRequirement: vi.fn().mockResolvedValue(revised),
    });
    const service = new AdminWillExecutionRequirementService(repository);

    const result = await service.reviseRequirement("req-1", makeContentInput({ notes: "updated" }));

    expect(repository.reviseRequirement).toHaveBeenCalledWith("req-1", expect.objectContaining({ notes: "updated" }));
    expect(result).toBe(revised);
  });

  it("throws WillExecutionRequirementNotFoundError for a nonexistent id without calling reviseRequirement", async () => {
    const repository = createFakeRepository({ getRequirement: vi.fn().mockResolvedValue(null) });
    const service = new AdminWillExecutionRequirementService(repository);

    await expect(service.reviseRequirement("nonexistent", makeContentInput())).rejects.toThrow(
      WillExecutionRequirementNotFoundError,
    );
    expect(repository.reviseRequirement).not.toHaveBeenCalled();
  });

  it("throws WillExecutionRequirementAlreadySupersededError when the existing row is already superseded", async () => {
    const existing = makeRequirement({ supersededById: "req-2" });
    const repository = createFakeRepository({ getRequirement: vi.fn().mockResolvedValue(existing) });
    const service = new AdminWillExecutionRequirementService(repository);

    await expect(service.reviseRequirement("req-1", makeContentInput())).rejects.toThrow(
      WillExecutionRequirementAlreadySupersededError,
    );
    expect(repository.reviseRequirement).not.toHaveBeenCalled();
  });

  it("validates the revised content before touching the repository", async () => {
    const repository = createFakeRepository();
    const service = new AdminWillExecutionRequirementService(repository);

    await expect(
      service.reviseRequirement("req-1", makeContentInput({ executionInstructions: "" })),
    ).rejects.toThrow(InvalidWillExecutionRequirementInputError);
    expect(repository.getRequirement).not.toHaveBeenCalled();
  });
});
