import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LegalRequirement, LegalRequirementRepository } from "@/domain/admin-legal-requirements/ports";
import { PATCH } from "./route";

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

function routeParams(id = "req-1") {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/legal-requirements/req-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validBody = {
  jurisdictionId: "jurisdiction-1",
  assetCategory: "financial",
  requirementType: "death_certificate_certified",
  submissionChannel: "mail",
  notes: "updated note",
};

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = createFakeRepository();
  requirePlatformAdminMock.mockResolvedValue({ supabase: {}, userId: "admin-1" });
});

describe("PATCH /api/admin/legal-requirements/:id (revise, never mutates in place)", () => {
  it("returns 403 when the caller is not a platform admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await PATCH(patchRequest(validBody), routeParams());
    expect(response.status).toBe(403);
    expect(fakeRepository.reviseRequirement).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid JSON body", async () => {
    const response = await PATCH(patchRequest("not json"), routeParams());
    expect(response.status).toBe(400);
  });

  it("returns 404 when the requirement being revised doesn't exist", async () => {
    fakeRepository.getRequirement = vi.fn().mockResolvedValue(null);

    const response = await PATCH(patchRequest(validBody), routeParams());
    expect(response.status).toBe(404);
  });

  it("returns 409 when the existing row has already been superseded", async () => {
    fakeRepository.getRequirement = vi.fn().mockResolvedValue(makeRequirement({ supersededById: "req-2" }));

    const response = await PATCH(patchRequest(validBody), routeParams());
    expect(response.status).toBe(409);
    expect(fakeRepository.reviseRequirement).not.toHaveBeenCalled();
  });

  it("creates a new version, returns it, and never calls an update-in-place path", async () => {
    const existing = makeRequirement();
    const revised = makeRequirement({ id: "req-2", notes: "updated note" });
    fakeRepository.getRequirement = vi.fn().mockResolvedValue(existing);
    fakeRepository.reviseRequirement = vi.fn().mockResolvedValue(revised);

    const response = await PATCH(patchRequest(validBody), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.requirement).toEqual(revised);
    expect(fakeRepository.reviseRequirement).toHaveBeenCalledWith(
      "req-1",
      expect.objectContaining({ notes: "updated note" }),
    );
  });
});
