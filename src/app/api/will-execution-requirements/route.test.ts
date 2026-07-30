import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WillExecutionRequirement, WillExecutionRequirementRepository } from "@/domain/admin-will-execution-requirements/ports";
import { GET } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

let fakeRepository: WillExecutionRequirementRepository;
vi.mock("@/infrastructure/admin-will-execution-requirements/supabase-admin-will-execution-requirement-repository", () => ({
  SupabaseAdminWillExecutionRequirementRepository: vi
    .fn()
    .mockImplementation(function SupabaseAdminWillExecutionRequirementRepository() {
      return fakeRepository;
    }),
}));

function makeRequirement(overrides: Partial<WillExecutionRequirement> = {}): WillExecutionRequirement {
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

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = {
    createRequirement: vi.fn(),
    listRequirements: vi.fn().mockResolvedValue([makeRequirement()]),
    getRequirement: vi.fn(),
    reviseRequirement: vi.fn(),
  };
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("GET /api/will-execution-requirements", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await GET(new Request("http://localhost/api/will-execution-requirements"));
    expect(response.status).toBe(401);
  });

  it("passes jurisdictionId through and returns the requirements", async () => {
    const response = await GET(
      new Request("http://localhost/api/will-execution-requirements?jurisdictionId=jurisdiction-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.requirements).toEqual([makeRequirement()]);
    expect(fakeRepository.listRequirements).toHaveBeenCalledWith({ jurisdictionId: "jurisdiction-1" });
  });
});
