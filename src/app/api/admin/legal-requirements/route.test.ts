import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LegalRequirement, LegalRequirementRepository } from "@/domain/admin-legal-requirements/ports";
import { GET, POST } from "./route";

const requirePlatformAdminMock = vi.fn();
vi.mock("@/app/api/_lib/require-platform-admin", () => ({
  requirePlatformAdmin: () => requirePlatformAdminMock(),
}));

function createFakeRepository(overrides: Partial<LegalRequirementRepository> = {}): LegalRequirementRepository {
  return {
    createRequirement: vi.fn(),
    listRequirements: vi.fn(),
    getRequirement: vi.fn(),
    reviseRequirement: vi.fn(),
    ...overrides,
  };
}

let fakeRepository: LegalRequirementRepository;
vi.mock("@/infrastructure/admin-legal-requirements/supabase-admin-legal-requirement-repository", () => ({
  SupabaseAdminLegalRequirementRepository: vi
    .fn()
    .mockImplementation(function SupabaseAdminLegalRequirementRepository() {
      return fakeRepository;
    }),
}));

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

function getRequest(query = ""): Request {
  return new Request(`http://localhost/api/admin/legal-requirements${query}`);
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/legal-requirements", {
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

describe("GET /api/admin/legal-requirements", () => {
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
    expect(fakeRepository.listRequirements).toHaveBeenCalledWith({
      jurisdictionId: undefined,
      assetCategory: undefined,
      includeSuperseded: false,
    });
  });

  it("passes filters through from query params", async () => {
    fakeRepository.listRequirements = vi.fn().mockResolvedValue([]);

    await GET(getRequest("?jurisdictionId=jurisdiction-1&assetCategory=financial&includeSuperseded=true"));

    expect(fakeRepository.listRequirements).toHaveBeenCalledWith({
      jurisdictionId: "jurisdiction-1",
      assetCategory: "financial",
      includeSuperseded: true,
    });
  });
});

describe("POST /api/admin/legal-requirements", () => {
  it("returns 403 when the caller is not a platform admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await POST(
      postRequest({
        jurisdictionId: "jurisdiction-1",
        assetCategory: "financial",
        requirementType: "death_certificate_certified",
        submissionChannel: "mail",
      }),
    );
    expect(response.status).toBe(403);
    expect(fakeRepository.createRequirement).not.toHaveBeenCalled();
  });

  it("returns 400 for missing required fields", async () => {
    const response = await POST(postRequest({ assetCategory: "financial" }));
    expect(response.status).toBe(400);
  });

  it("returns 400 (via the real service validation) for an invalid requirementType", async () => {
    const response = await POST(
      postRequest({
        jurisdictionId: "jurisdiction-1",
        assetCategory: "financial",
        requirementType: "not-a-type",
        submissionChannel: "mail",
      }),
    );
    expect(response.status).toBe(400);
    expect(fakeRepository.createRequirement).not.toHaveBeenCalled();
  });

  it("creates the requirement and returns 201", async () => {
    const requirement = makeRequirement();
    fakeRepository.createRequirement = vi.fn().mockResolvedValue(requirement);

    const response = await POST(
      postRequest({
        jurisdictionId: "jurisdiction-1",
        assetCategory: "financial",
        requirementType: "death_certificate_certified",
        submissionChannel: "mail",
        pendingCounselReview: false,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.requirement).toEqual(requirement);
  });
});
