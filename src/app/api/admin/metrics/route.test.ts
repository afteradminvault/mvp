import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminMetricsRepository, AdminOverviewMetrics } from "@/domain/admin-metrics/ports";
import { GET } from "./route";

const requirePlatformAdminMock = vi.fn();
vi.mock("@/app/api/_lib/require-platform-admin", () => ({
  requirePlatformAdmin: () => requirePlatformAdminMock(),
}));

let fakeRepository: AdminMetricsRepository;
vi.mock("@/infrastructure/admin-metrics/supabase-admin-metrics-repository", () => ({
  SupabaseAdminMetricsRepository: vi.fn().mockImplementation(function SupabaseAdminMetricsRepository() {
    return fakeRepository;
  }),
}));

const metrics: AdminOverviewMetrics = { userCount: 10, activeCaseCount: 5, accountsClosedCount: 2, vaultItemCount: 40 };

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = { getOverviewMetrics: vi.fn().mockResolvedValue(metrics) };
  requirePlatformAdminMock.mockResolvedValue({ supabase: {}, userId: "admin-1" });
});

describe("GET /api/admin/metrics", () => {
  it("returns 401 (via requirePlatformAdmin) when the caller isn't an admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await GET();
    expect(response.status).toBe(403);
  });

  it("returns the overview metrics", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.metrics).toEqual(metrics);
  });
});
