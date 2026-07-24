import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Beneficiary, BeneficiaryRepository } from "@/domain/beneficiaries/ports";
import type { DigitalAsset, DigitalAssetRepository } from "@/domain/assets/ports";
import { DELETE, PATCH } from "./route";

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

function routeParams(id = "estate-1", beneficiaryId = "beneficiary-1") {
  return { params: Promise.resolve({ id, beneficiaryId }) };
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/estates/estate-1/beneficiaries/beneficiary-1", {
    method: "PATCH",
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

describe("PATCH /api/estates/:id/beneficiaries/:beneficiaryId", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await PATCH(patchRequest({ displayName: "New Name" }), routeParams());
    expect(response.status).toBe(401);
    expect(fakeRepository.updateBeneficiary).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid JSON body", async () => {
    const response = await PATCH(patchRequest("not json"), routeParams());
    expect(response.status).toBe(400);
  });

  it("returns 404 when the beneficiary belongs to a different estate than the URL claims", async () => {
    const beneficiary = makeBeneficiary({ estateId: "some-other-estate" });
    fakeRepository.getBeneficiary = vi.fn().mockResolvedValue(beneficiary);

    const response = await PATCH(patchRequest({ displayName: "New Name" }), routeParams());
    expect(response.status).toBe(404);
    expect(fakeRepository.updateBeneficiary).not.toHaveBeenCalled();
  });

  it("returns 404 when the beneficiary does not exist", async () => {
    fakeRepository.getBeneficiary = vi.fn().mockResolvedValue(null);

    const response = await PATCH(patchRequest({ displayName: "New Name" }), routeParams());
    expect(response.status).toBe(404);
  });

  it("updates the beneficiary and returns 200 on valid input", async () => {
    const beneficiary = makeBeneficiary();
    const updated = makeBeneficiary({ displayName: "Diane S." });
    fakeRepository.getBeneficiary = vi.fn().mockResolvedValue(beneficiary);
    fakeRepository.updateBeneficiary = vi.fn().mockResolvedValue(updated);

    const response = await PATCH(patchRequest({ displayName: "Diane S." }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.beneficiary).toEqual(updated);
    expect(fakeRepository.updateBeneficiary).toHaveBeenCalledWith("beneficiary-1", { displayName: "Diane S." });
  });

  it("allows clearing digitalAssetId to null (estate-wide)", async () => {
    const beneficiary = makeBeneficiary({ digitalAssetId: "asset-1" });
    const updated = makeBeneficiary({ digitalAssetId: null });
    fakeRepository.getBeneficiary = vi.fn().mockResolvedValue(beneficiary);
    fakeRepository.updateBeneficiary = vi.fn().mockResolvedValue(updated);

    const response = await PATCH(patchRequest({ digitalAssetId: null }), routeParams());

    expect(response.status).toBe(200);
    expect(fakeRepository.updateBeneficiary).toHaveBeenCalledWith("beneficiary-1", { digitalAssetId: null });
  });

  it("returns 400 (via the real BeneficiaryService validation) when digitalAssetId references an asset in a different estate", async () => {
    const beneficiary = makeBeneficiary();
    fakeRepository.getBeneficiary = vi.fn().mockResolvedValue(beneficiary);
    fakeAssetRepository.getAsset = vi
      .fn()
      .mockResolvedValue({ id: "asset-1", estateId: "some-other-estate" } as DigitalAsset);

    const response = await PATCH(patchRequest({ digitalAssetId: "asset-1" }), routeParams());

    expect(response.status).toBe(400);
    expect(fakeRepository.updateBeneficiary).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/estates/:id/beneficiaries/:beneficiaryId", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await DELETE(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
    expect(fakeRepository.deleteBeneficiary).not.toHaveBeenCalled();
  });

  it("returns 404 when the beneficiary belongs to a different estate than the URL claims", async () => {
    const beneficiary = makeBeneficiary({ estateId: "some-other-estate" });
    fakeRepository.getBeneficiary = vi.fn().mockResolvedValue(beneficiary);

    const response = await DELETE(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(404);
    expect(fakeRepository.deleteBeneficiary).not.toHaveBeenCalled();
  });

  it("deletes (hard-delete) the beneficiary and returns 200", async () => {
    const beneficiary = makeBeneficiary();
    fakeRepository.getBeneficiary = vi.fn().mockResolvedValue(beneficiary);
    fakeRepository.deleteBeneficiary = vi.fn().mockResolvedValue(undefined);

    const response = await DELETE(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(fakeRepository.deleteBeneficiary).toHaveBeenCalledWith("beneficiary-1");
  });
});
