import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Beneficiary, BeneficiaryRepository } from "@/domain/beneficiaries/ports";
import type { DigitalAsset, DigitalAssetRepository } from "@/domain/assets/ports";
import { GET, POST } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

function createFakeRepository(overrides: Partial<BeneficiaryRepository> = {}): BeneficiaryRepository {
  return {
    createBeneficiary: vi.fn(),
    getBeneficiary: vi.fn(),
    updateBeneficiary: vi.fn(),
    deleteBeneficiary: vi.fn(),
    listBeneficiaries: vi.fn(),
    ...overrides,
  };
}

function createFakeAssetRepository(overrides: Partial<DigitalAssetRepository> = {}): DigitalAssetRepository {
  return {
    createAsset: vi.fn(),
    getAsset: vi.fn(),
    updateAsset: vi.fn(),
    archiveAsset: vi.fn(),
    listAssets: vi.fn(),
    ...overrides,
  };
}

let fakeRepository: BeneficiaryRepository;
vi.mock("@/infrastructure/beneficiaries/supabase-beneficiary-repository", () => ({
  SupabaseBeneficiaryRepository: vi.fn().mockImplementation(function SupabaseBeneficiaryRepository() {
    return fakeRepository;
  }),
}));

let fakeAssetRepository: DigitalAssetRepository;
vi.mock("@/infrastructure/assets/supabase-asset-repository", () => ({
  SupabaseDigitalAssetRepository: vi.fn().mockImplementation(function SupabaseDigitalAssetRepository() {
    return fakeAssetRepository;
  }),
}));

function makeBeneficiary(overrides: Partial<Beneficiary> = {}): Beneficiary {
  return {
    id: "beneficiary-1",
    estateId: "estate-1",
    digitalAssetId: null,
    displayName: "Diane Smith",
    relationship: "daughter",
    contactEmail: "diane@example.com",
    linkedUserId: null,
    notes: null,
    createdAt: "2026-07-24T00:00:00.000Z",
    ...overrides,
  };
}

function makeAsset(overrides: Partial<DigitalAsset> = {}): DigitalAsset {
  return {
    id: "asset-1",
    estateId: "estate-1",
    category: "financial",
    providerId: null,
    customProviderName: "Chase Checking",
    accountIdentifier: null,
    intendedOutcome: "close",
    intendedOutcomeNotes: null,
    estimatedValueCents: null,
    currency: null,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

function routeParams(id = "estate-1") {
  return { params: Promise.resolve({ id }) };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/estates/estate-1/beneficiaries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = createFakeRepository();
  fakeAssetRepository = createFakeAssetRepository();
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("GET /api/estates/:id/beneficiaries", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
  });

  it("lists beneficiaries for the estate", async () => {
    const beneficiaries = [makeBeneficiary()];
    fakeRepository.listBeneficiaries = vi.fn().mockResolvedValue(beneficiaries);

    const response = await GET(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.beneficiaries).toEqual(beneficiaries);
    expect(fakeRepository.listBeneficiaries).toHaveBeenCalledWith("estate-1");
  });
});

describe("POST /api/estates/:id/beneficiaries", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(postRequest({ displayName: "Diane Smith" }), routeParams());
    expect(response.status).toBe(401);
    expect(fakeRepository.createBeneficiary).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid JSON body", async () => {
    const response = await POST(postRequest("not json"), routeParams());
    expect(response.status).toBe(400);
  });

  it("returns 400 when displayName is missing", async () => {
    const response = await POST(postRequest({ relationship: "daughter" }), routeParams());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/displayName/);
  });

  it("returns 400 (via the real BeneficiaryService validation) for a malformed contactEmail", async () => {
    const response = await POST(
      postRequest({ displayName: "Diane Smith", contactEmail: "not-an-email" }),
      routeParams(),
    );
    expect(response.status).toBe(400);
    expect(fakeRepository.createBeneficiary).not.toHaveBeenCalled();
  });

  it("creates an estate-wide beneficiary and returns 201 on valid input", async () => {
    const created = makeBeneficiary();
    fakeRepository.createBeneficiary = vi.fn().mockResolvedValue(created);

    const response = await POST(
      postRequest({ displayName: "Diane Smith", relationship: "daughter", contactEmail: "diane@example.com" }),
      routeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.beneficiary).toEqual(created);
    expect(fakeRepository.createBeneficiary).toHaveBeenCalledWith("estate-1", {
      digitalAssetId: null,
      displayName: "Diane Smith",
      relationship: "daughter",
      contactEmail: "diane@example.com",
      notes: null,
    });
  });

  it("creates an asset-linked beneficiary when digitalAssetId references an asset in this estate", async () => {
    const created = makeBeneficiary({ digitalAssetId: "asset-1" });
    fakeAssetRepository.getAsset = vi.fn().mockResolvedValue(makeAsset());
    fakeRepository.createBeneficiary = vi.fn().mockResolvedValue(created);

    const response = await POST(
      postRequest({ displayName: "Diane Smith", digitalAssetId: "asset-1" }),
      routeParams(),
    );

    expect(response.status).toBe(201);
    expect(fakeRepository.createBeneficiary).toHaveBeenCalledWith(
      "estate-1",
      expect.objectContaining({ digitalAssetId: "asset-1" }),
    );
  });

  it("returns 400 when digitalAssetId references an asset in a different estate", async () => {
    fakeAssetRepository.getAsset = vi.fn().mockResolvedValue(makeAsset({ estateId: "some-other-estate" }));

    const response = await POST(
      postRequest({ displayName: "Diane Smith", digitalAssetId: "asset-1" }),
      routeParams(),
    );

    expect(response.status).toBe(400);
    expect(fakeRepository.createBeneficiary).not.toHaveBeenCalled();
  });
});
