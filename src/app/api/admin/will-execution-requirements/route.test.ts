import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WillExecutionRequirement, WillExecutionRequirementRepository } from "@/domain/admin-will-execution-requirements/ports";
import { GET, POST } from "./route";

const requirePlatformAdminMock = vi.fn();
vi.mock("@/app/api/_lib/require-platform-admin", () => ({
  requirePlatformAdmin: () => requirePlatformAdminMock(),
}));

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

function getRequest(query = ""): Request {
  return new Request(`http://localhost/api/admin/will-execution-requirements${query}`);
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/will-execution-requirements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = createFakeRepository();
  requirePlatformAdminMock.mockResolvedValue({ supabase: {}, userId: "admin-1" });
});

describe("GET /api/admin/will-execution-requirements", () => {
  it("returns 403 when the caller is not a platform admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await GET(getRequest());
    expect(response.status).toBe(403);
  });

  it("lists current (non-superseded) requirements by default", async () => {
    const requirements = [makeRequirement()];
    fakeRepository.listRequirements = vi.fn().mockResolvedValue(requirements);

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.requirements).toEqual(requirements);
    expect(fakeRepository.listRequirements).toHaveBeenCalledWith({ jurisdictionId: undefined, includeSuperseded: false });
  });

  it("passes filters through from query params", async () => {
    fakeRepository.listRequirements = vi.fn().mockResolvedValue([]);

    await GET(getRequest("?jurisdictionId=jurisdiction-1&includeSuperseded=true"));

    expect(fakeRepository.listRequirements).toHaveBeenCalledWith({ jurisdictionId: "jurisdiction-1", includeSuperseded: true });
  });
});

describe("POST /api/admin/will-execution-requirements", () => {
  it("returns 403 when the caller is not a platform admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await POST(
      postRequest({ jurisdictionId: "jurisdiction-1", executionInstructions: "Sign in front of two witnesses." }),
    );
    expect(response.status).toBe(403);
    expect(fakeRepository.createRequirement).not.toHaveBeenCalled();
  });

  it("returns 400 for missing required fields", async () => {
    const response = await POST(postRequest({ jurisdictionId: "jurisdiction-1" }));
    expect(response.status).toBe(400);
  });

  it("returns 400 (via the real service validation) for a negative witnessCount", async () => {
    const response = await POST(
      postRequest({
        jurisdictionId: "jurisdiction-1",
        executionInstructions: "Sign in front of two witnesses.",
        witnessCount: -1,
      }),
    );
    expect(response.status).toBe(400);
    expect(fakeRepository.createRequirement).not.toHaveBeenCalled();
  });

  it("creates the requirement and returns 201", async () => {
    const requirement = makeRequirement();
    fakeRepository.createRequirement = vi.fn().mockResolvedValue(requirement);

    const response = await POST(
      postRequest({ jurisdictionId: "jurisdiction-1", executionInstructions: "Sign in front of two witnesses." }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.requirement).toEqual(requirement);
  });
});
