import { describe, expect, it, vi } from "vitest";
import type { AdminMetricsRepository, AdminOverviewMetrics } from "./ports";
import { AdminMetricService } from "./admin-metric-service";

describe("AdminMetricService.getOverviewMetrics", () => {
  it("delegates directly to the repository", async () => {
    const metrics: AdminOverviewMetrics = {
      userCount: 120,
      activeCaseCount: 45,
      accountsClosedCount: 30,
      vaultItemCount: 900,
    };
    const repository: AdminMetricsRepository = { getOverviewMetrics: vi.fn().mockResolvedValue(metrics) };
    const service = new AdminMetricService(repository);

    await expect(service.getOverviewMetrics()).resolves.toBe(metrics);
  });

  it("never includes MRR/churn/subscriptions fields — no subscriptions table exists yet", async () => {
    const metrics: AdminOverviewMetrics = {
      userCount: 1,
      activeCaseCount: 1,
      accountsClosedCount: 0,
      vaultItemCount: 0,
    };
    const repository: AdminMetricsRepository = { getOverviewMetrics: vi.fn().mockResolvedValue(metrics) };
    const service = new AdminMetricService(repository);

    const result = await service.getOverviewMetrics();

    expect(Object.keys(result).sort()).toEqual(
      ["accountsClosedCount", "activeCaseCount", "userCount", "vaultItemCount"].sort(),
    );
  });
});
