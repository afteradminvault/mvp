import { describe, expect, it, vi } from "vitest";
import type { ReadinessFacts, ReadinessRepository } from "./ports";
import { ReadinessForbiddenError, ReadinessService, scoreReadiness } from "./readiness-service";

function makeFacts(overrides: Partial<ReadinessFacts> = {}): ReadinessFacts {
  return {
    totalAssetCount: 4,
    assetsWithInstructionsCount: 2,
    hasAcceptedExecutor: true,
    ownerMfaEnabled: true,
    hasAcceptedBackupExecutor: false,
    ...overrides,
  };
}

describe("scoreReadiness", () => {
  it("computes each component and the overall average", () => {
    const score = scoreReadiness(makeFacts());

    expect(score.assetsWithInstructionsPercent).toBe(50);
    expect(score.executorConfirmed).toBe(true);
    expect(score.mfaEnabled).toBe(true);
    expect(score.backupExecutorConfigured).toBe(false);
    // (50 + 100 + 100 + 0) / 4 = 62.5 -> rounds to 63
    expect(score.overallPercent).toBe(63);
  });

  it("treats zero assets as 0% instructions-set, not a vacuous 100%", () => {
    const score = scoreReadiness(makeFacts({ totalAssetCount: 0, assetsWithInstructionsCount: 0 }));
    expect(score.assetsWithInstructionsPercent).toBe(0);
  });

  it("returns 100 overall when every component is fully satisfied", () => {
    const score = scoreReadiness(
      makeFacts({
        totalAssetCount: 3,
        assetsWithInstructionsCount: 3,
        hasAcceptedExecutor: true,
        ownerMfaEnabled: true,
        hasAcceptedBackupExecutor: true,
      }),
    );
    expect(score).toEqual({
      overallPercent: 100,
      assetsWithInstructionsPercent: 100,
      executorConfirmed: true,
      mfaEnabled: true,
      backupExecutorConfigured: true,
    });
  });

  it("returns 0 overall when nothing is satisfied and there are no assets", () => {
    const score = scoreReadiness({
      totalAssetCount: 0,
      assetsWithInstructionsCount: 0,
      hasAcceptedExecutor: false,
      ownerMfaEnabled: false,
      hasAcceptedBackupExecutor: false,
    });
    expect(score.overallPercent).toBe(0);
  });
});

describe("ReadinessService.getReadinessScore", () => {
  it("delegates to the repository and scores the returned facts", async () => {
    const repository: ReadinessRepository = { getReadinessFacts: vi.fn().mockResolvedValue(makeFacts()) };
    const service = new ReadinessService(repository);

    const score = await service.getReadinessScore("estate-1");
    expect(score.overallPercent).toBe(63);
  });

  it("translates a repository 'only the estate owner' error into ReadinessForbiddenError", async () => {
    const repository: ReadinessRepository = {
      getReadinessFacts: vi.fn().mockRejectedValue(new Error("only the estate owner can view this")),
    };
    const service = new ReadinessService(repository);

    await expect(service.getReadinessScore("estate-1")).rejects.toThrow(ReadinessForbiddenError);
  });

  it("re-throws unrelated repository errors as-is", async () => {
    const repository: ReadinessRepository = {
      getReadinessFacts: vi.fn().mockRejectedValue(new Error("network error")),
    };
    const service = new ReadinessService(repository);

    await expect(service.getReadinessScore("estate-1")).rejects.toThrow("network error");
  });
});
