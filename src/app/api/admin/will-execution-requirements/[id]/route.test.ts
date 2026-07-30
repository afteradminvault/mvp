import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WillExecutionRequirement, WillExecutionRequirementRepository } from "@/domain/admin-will-execution-requirements/ports";
import { PATCH } from "./route";

const requirePlatformAdminMock = vi.fn();
vi.mock("@/app/api/_lib/require-platform-admin", () => ({
  requirePlatformAdmin: () => requirePlatformAdminMock(),
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

function routeParams(id = "req-1") {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/will-execution-requirements/req-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = {
    createRequirement: vi.fn(),
    listRequirements: vi.fn(),
    getRequirement: vi.fn().mockResolvedValue(makeRequirement()),
    reviseRequirement: vi.fn(),
  };
  requirePlatformAdminMock.mockResolvedValue({ supabase: {}, userId: "admin-1" });
});

describe("PATCH /api/admin/will-execution-requirements/:id", () => {
  it("returns 403 when the caller is not a platform admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await PATCH(
      patchRequest({ jurisdictionId: "jurisdiction-1", executionInstructions: "Updated." }),
      routeParams(),
    );
    expect(response.status).toBe(403);
  });

  it("creates a new version and links the old one to it (never mutates in place)", async () => {
    const revised = makeRequirement({ id: "req-2", executionInstructions: "Updated instructions." });
    fakeRepository.reviseRequirement = vi.fn().mockResolvedValue(revised);

    const response = await PATCH(
      patchRequest({ jurisdictionId: "jurisdiction-1", executionInstructions: "Updated instructions." }),
      routeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.requirement).toEqual(revised);
    expect(fakeRepository.reviseRequirement).toHaveBeenCalledWith(
      "req-1",
      expect.objectContaining({ executionInstructions: "Updated instructions." }),
    );
  });

  it("returns 404 when the requirement doesn't exist", async () => {
    fakeRepository.getRequirement = vi.fn().mockResolvedValue(null);

    const response = await PATCH(
      patchRequest({ jurisdictionId: "jurisdiction-1", executionInstructions: "Updated." }),
      routeParams(),
    );
    expect(response.status).toBe(404);
  });
});
