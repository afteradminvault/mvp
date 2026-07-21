import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DigitalAsset, DigitalAssetRepository } from "@/domain/assets/ports";
import { DELETE, GET, PATCH } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

function createFakeRepository(overrides: Partial<DigitalAssetRepository> = {}): DigitalAssetRepository {
  return {
    createAsset: vi.fn(),
    getAsset: vi.fn(),
    updateAsset: vi.fn(),
    archiveAsset: vi.fn(),
    listAssets: vi.fn(),
    ...overrides,
  };
}

let fakeRepository: DigitalAssetRepository;
vi.mock("@/infrastructure/assets/supabase-asset-repository", () => ({
  SupabaseDigitalAssetRepository: vi.fn().mockImplementation(function SupabaseDigitalAssetRepository() {
    return fakeRepository;
  }),
}));

function makeAsset(overrides: Partial<DigitalAsset> = {}): DigitalAsset {
  return {
    id: "asset-1",
    estateId: "estate-1",
    category: "financial",
    providerId: null,
    customProviderName: "Chase Checking",
    accountIdentifier: "****1234",
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

function routeParams(id = "estate-1", assetId = "asset-1") {
  return { params: Promise.resolve({ id, assetId }) };
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/estates/estate-1/assets/asset-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = createFakeRepository();
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("GET /api/estates/:id/assets/:assetId", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
  });

  it("returns the asset when it belongs to the URL's estate", async () => {
    const asset = makeAsset();
    fakeRepository.getAsset = vi.fn().mockResolvedValue(asset);

    const response = await GET(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.asset).toEqual(asset);
  });

  it("returns 404 when the asset belongs to a different estate than the URL claims", async () => {
    const asset = makeAsset({ estateId: "some-other-estate" });
    fakeRepository.getAsset = vi.fn().mockResolvedValue(asset);

    const response = await GET(new Request("http://localhost"), routeParams("estate-1", "asset-1"));
    expect(response.status).toBe(404);
  });

  it("returns 404 when the asset does not exist", async () => {
    fakeRepository.getAsset = vi.fn().mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/estates/:id/assets/:assetId", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await PATCH(patchRequest({ accountIdentifier: "new" }), routeParams());
    expect(response.status).toBe(401);
    expect(fakeRepository.updateAsset).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid JSON body", async () => {
    const response = await PATCH(patchRequest("not json"), routeParams());
    expect(response.status).toBe(400);
  });

  it("returns 404 when the asset belongs to a different estate than the URL claims", async () => {
    const asset = makeAsset({ estateId: "some-other-estate" });
    fakeRepository.getAsset = vi.fn().mockResolvedValue(asset);

    const response = await PATCH(patchRequest({ accountIdentifier: "new" }), routeParams());
    expect(response.status).toBe(404);
    expect(fakeRepository.updateAsset).not.toHaveBeenCalled();
  });

  it("returns 400 (via the real AssetService validation) when editing an archived asset", async () => {
    const asset = makeAsset({ archivedAt: "2026-07-20T00:00:00.000Z" });
    fakeRepository.getAsset = vi.fn().mockResolvedValue(asset);

    const response = await PATCH(patchRequest({ accountIdentifier: "new" }), routeParams());
    expect(response.status).toBe(400);
    expect(fakeRepository.updateAsset).not.toHaveBeenCalled();
  });

  it("updates the asset and returns 200 on valid input", async () => {
    const asset = makeAsset();
    const updated = makeAsset({ accountIdentifier: "****9999" });
    fakeRepository.getAsset = vi.fn().mockResolvedValue(asset);
    fakeRepository.updateAsset = vi.fn().mockResolvedValue(updated);

    const response = await PATCH(patchRequest({ accountIdentifier: "****9999" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.asset).toEqual(updated);
    expect(fakeRepository.updateAsset).toHaveBeenCalledWith("asset-1", { accountIdentifier: "****9999" });
  });
});

describe("DELETE /api/estates/:id/assets/:assetId (archive)", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await DELETE(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
    expect(fakeRepository.archiveAsset).not.toHaveBeenCalled();
  });

  it("returns 404 when the asset belongs to a different estate than the URL claims", async () => {
    const asset = makeAsset({ estateId: "some-other-estate" });
    fakeRepository.getAsset = vi.fn().mockResolvedValue(asset);

    const response = await DELETE(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(404);
    expect(fakeRepository.archiveAsset).not.toHaveBeenCalled();
  });

  it("archives (soft-deletes) the asset and returns 200 — never a hard delete", async () => {
    const asset = makeAsset();
    const archived = makeAsset({ archivedAt: "2026-07-20T00:00:00.000Z" });
    fakeRepository.getAsset = vi.fn().mockResolvedValue(asset);
    fakeRepository.archiveAsset = vi.fn().mockResolvedValue(archived);

    const response = await DELETE(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.asset.archivedAt).not.toBeNull();
    expect(fakeRepository.archiveAsset).toHaveBeenCalledWith("asset-1");
  });
});
