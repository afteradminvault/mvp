import { describe, expect, it, vi } from "vitest";
import type { AdminCaseRepository, AdminCaseSummary } from "./ports";
import { AdminCaseService, InvalidAdminCaseInputError, MAX_FLAGGED_NOTES_LENGTH } from "./admin-case-service";

function makeCase(overrides: Partial<AdminCaseSummary> = {}): AdminCaseSummary {
  return {
    id: "case-1",
    displayName: "Diane Whitfield's Case",
    status: "active_living",
    flagged: false,
    flaggedNotes: null,
    createdAt: "2026-08-04T00:00:00.000Z",
    ...overrides,
  };
}

function createFakeRepository(overrides: Partial<AdminCaseRepository> = {}): AdminCaseRepository {
  return {
    listCases: vi.fn(),
    flagCase: vi.fn(),
    ...overrides,
  };
}

describe("AdminCaseService.listCases", () => {
  it("applies default limit/offset and flaggedOnly=false when not requested", async () => {
    const repository = createFakeRepository({ listCases: vi.fn().mockResolvedValue({ cases: [], total: 0 }) });
    const service = new AdminCaseService(repository);

    await service.listCases({});

    expect(repository.listCases).toHaveBeenCalledWith({ flaggedOnly: false, limit: 50, offset: 0 });
  });

  it("passes flaggedOnly=true when the query string value is 'true'", async () => {
    const repository = createFakeRepository({ listCases: vi.fn().mockResolvedValue({ cases: [], total: 0 }) });
    const service = new AdminCaseService(repository);

    await service.listCases({ flaggedOnly: "true" });

    expect(repository.listCases).toHaveBeenCalledWith(expect.objectContaining({ flaggedOnly: true }));
  });

  it("rejects an out-of-range limit", async () => {
    const repository = createFakeRepository();
    const service = new AdminCaseService(repository);

    await expect(service.listCases({ limit: "0" })).rejects.toThrow(InvalidAdminCaseInputError);
  });
});

describe("AdminCaseService.flagCase", () => {
  it("flags a case with notes", async () => {
    const flagged = makeCase({ flagged: true, flaggedNotes: "Repeated failed login attempts." });
    const repository = createFakeRepository({ flagCase: vi.fn().mockResolvedValue(flagged) });
    const service = new AdminCaseService(repository);

    const result = await service.flagCase("case-1", { flagged: true, flaggedNotes: "Repeated failed login attempts." });

    expect(repository.flagCase).toHaveBeenCalledWith("case-1", {
      flagged: true,
      flaggedNotes: "Repeated failed login attempts.",
    });
    expect(result).toBe(flagged);
  });

  it("clears a flag without touching notes when flaggedNotes isn't provided", async () => {
    const repository = createFakeRepository({ flagCase: vi.fn().mockResolvedValue(makeCase()) });
    const service = new AdminCaseService(repository);

    await service.flagCase("case-1", { flagged: false });

    expect(repository.flagCase).toHaveBeenCalledWith("case-1", { flagged: false });
  });

  it("rejects a non-boolean flagged value", async () => {
    const repository = createFakeRepository();
    const service = new AdminCaseService(repository);

    await expect(service.flagCase("case-1", { flagged: "yes" })).rejects.toThrow(InvalidAdminCaseInputError);
  });

  it(`rejects flaggedNotes longer than ${MAX_FLAGGED_NOTES_LENGTH} characters`, async () => {
    const repository = createFakeRepository();
    const service = new AdminCaseService(repository);

    await expect(
      service.flagCase("case-1", { flagged: true, flaggedNotes: "x".repeat(MAX_FLAGGED_NOTES_LENGTH + 1) }),
    ).rejects.toThrow(InvalidAdminCaseInputError);
  });
});
