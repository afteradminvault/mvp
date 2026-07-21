import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DigitalAsset, DigitalAssetRepository } from "@/domain/assets/ports";
import { GET, POST } from "./route";

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

function routeParams(id = "estate-1") {
  return { params: Promise.resolve({ id }) };
}

function getRequest(query = ""): Request {
  return new Request(`http://localhost/api/estates/estate-1/assets${query}`);
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/estates/estate-1/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = createFakeRepository();
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("GET /api/estates/:id/assets", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await GET(getRequest(), routeParams());
    expect(response.status).toBe(401);
  });

  it("lists non-archived assets by default", async () => {
    const assets = [makeAsset()];
    fakeRepository.listAssets = vi.fn().mockResolvedValue(assets);

    const response = await GET(getRequest(), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assets).toEqual(assets);
    expect(fakeRepository.listAssets).toHaveBeenCalledWith("estate-1", {
      category: undefined,
      includeArchived: false,
    });
  });

  it("passes the category filter through", async () => {
    fakeRepository.listAssets = vi.fn().mockResolvedValue([]);

    await GET(getRequest("?category=financial"), routeParams());

    expect(fakeRepository.listAssets).toHaveBeenCalledWith("estate-1", {
      category: "financial",
      includeArchived: false,
    });
  });

  it("includes archived assets when archived=true", async () => {
    fakeRepository.listAssets = vi.fn().mockResolvedValue([]);

    await GET(getRequest("?archived=true"), routeParams());

    expect(fakeRepository.listAssets).toHaveBeenCalledWith("estate-1", {
      category: undefined,
      includeArchived: true,
    });
  });
});

describe("POST /api/estates/:id/assets", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(postRequest({ category: "financial", customProviderName: "Chase" }), routeParams());
    expect(response.status).toBe(401);
    expect(fakeRepository.createAsset).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid JSON body", async () => {
    const response = await POST(postRequest("not json"), routeParams());
    expect(response.status).toBe(400);
  });

  it("returns 400 when category is missing", async () => {
    const response = await POST(postRequest({ customProviderName: "Chase" }), routeParams());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/category/);
  });

  it("returns 400 (via the real AssetService validation) when neither provider field is given", async () => {
    const response = await POST(postRequest({ category: "financial" }), routeParams());
    expect(response.status).toBe(400);
    expect(fakeRepository.createAsset).not.toHaveBeenCalled();
  });

  it("returns 400 (via the real AssetService validation) for an invalid category value", async () => {
    const response = await POST(
      postRequest({ category: "not-a-category", customProviderName: "Chase" }),
      routeParams(),
    );
    expect(response.status).toBe(400);
    expect(fakeRepository.createAsset).not.toHaveBeenCalled();
  });

  it("creates the asset and returns 201 on valid input", async () => {
    const created = makeAsset();
    fakeRepository.createAsset = vi.fn().mockResolvedValue(created);

    const response = await POST(
      postRequest({ category: "financial", customProviderName: "Chase Checking", accountIdentifier: "****1234" }),
      routeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.asset).toEqual(created);
    expect(fakeRepository.createAsset).toHaveBeenCalledWith("estate-1", {
      category: "financial",
      providerId: null,
      customProviderName: "Chase Checking",
      accountIdentifier: "****1234",
      intendedOutcome: undefined,
      intendedOutcomeNotes: null,
      estimatedValueCents: null,
      currency: null,
    });
  });
});
