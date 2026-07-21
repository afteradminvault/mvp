import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReadinessFacts, ReadinessRepository } from "@/domain/readiness/ports";
import { GET } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

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

let fakeRepository: ReadinessRepository;
vi.mock("@/infrastructure/readiness/supabase-readiness-repository", () => ({
  SupabaseReadinessRepository: vi.fn().mockImplementation(function SupabaseReadinessRepository() {
    return fakeRepository;
  }),
}));

function routeParams(id = "estate-1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = { getReadinessFacts: vi.fn().mockResolvedValue(makeFacts()) };
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("GET /api/estates/:id/readiness-score", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
  });

  it("returns 403 when the caller is not the estate owner", async () => {
    fakeRepository.getReadinessFacts = vi
      .fn()
      .mockRejectedValue(new Error("only the estate owner can view this estate's readiness score"));

    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(403);
  });

  it("returns the computed readiness score", async () => {
    const response = await GET(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.readinessScore).toEqual({
      overallPercent: 63,
      assetsWithInstructionsPercent: 50,
      executorConfirmed: true,
      mfaEnabled: true,
      backupExecutorConfigured: false,
    });
  });
});
