import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DigitalVaultItem, VaultItemRepository } from "@/domain/vault-items/ports";
import { GET, POST } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

const writeAuditLogMock = vi.fn();
vi.mock("@/app/api/_lib/audit-log", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
}));

function createFakeRepository(overrides: Partial<VaultItemRepository> = {}): VaultItemRepository {
  return {
    createItem: vi.fn(),
    listItems: vi.fn(),
    getItem: vi.fn(),
    rotateItem: vi.fn(),
    deleteItem: vi.fn(),
    ...overrides,
  };
}

let fakeRepository: VaultItemRepository;
vi.mock("@/infrastructure/vault-items/supabase-vault-item-repository", () => ({
  SupabaseVaultItemRepository: vi.fn().mockImplementation(function SupabaseVaultItemRepository() {
    return fakeRepository;
  }),
}));

function makeItem(overrides: Partial<DigitalVaultItem> = {}): DigitalVaultItem {
  return {
    id: "item-1",
    digitalAssetId: "asset-1",
    itemType: "password",
    ciphertext: "aabbcc",
    encryptionIv: "112233",
    wrappedDataKey: "445566",
    keyVersion: 1,
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
    ...overrides,
  };
}

function routeParams(id = "estate-1", assetId = "asset-1") {
  return { params: Promise.resolve({ id, assetId }) };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/estates/estate-1/assets/asset-1/vault-items", {
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

describe("GET /api/estates/:id/assets/:assetId/vault-items", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
  });

  it("returns ciphertext-only items and writes a vault_items_viewed audit log", async () => {
    const items = [makeItem()];
    fakeRepository.listItems = vi.fn().mockResolvedValue(items);

    const response = await GET(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toEqual(items);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        estateId: "estate-1",
        actorUserId: "user-1",
        eventType: "vault_items_viewed",
        targetId: "asset-1",
      }),
    );
  });
});

describe("POST /api/estates/:id/assets/:assetId/vault-items", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(
      postRequest({ itemType: "password", ciphertext: "aabbcc", encryptionIv: "112233", wrappedDataKey: "445566" }),
      routeParams(),
    );
    expect(response.status).toBe(401);
    expect(fakeRepository.createItem).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid JSON body", async () => {
    const response = await POST(postRequest("not json"), routeParams());
    expect(response.status).toBe(400);
  });

  it("returns 400 when itemType is missing", async () => {
    const response = await POST(
      postRequest({ ciphertext: "aabbcc", encryptionIv: "112233", wrappedDataKey: "445566" }),
      routeParams(),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when ciphertext/encryptionIv/wrappedDataKey are missing", async () => {
    const response = await POST(postRequest({ itemType: "password" }), routeParams());
    expect(response.status).toBe(400);
  });

  it("returns 400 (via the real VaultItemService validation) for a non-hex field", async () => {
    const response = await POST(
      postRequest({ itemType: "password", ciphertext: "zz", encryptionIv: "112233", wrappedDataKey: "445566" }),
      routeParams(),
    );
    expect(response.status).toBe(400);
    expect(fakeRepository.createItem).not.toHaveBeenCalled();
  });

  it("creates the item, writes a vault_item_created audit log, and returns 201", async () => {
    const created = makeItem();
    fakeRepository.createItem = vi.fn().mockResolvedValue(created);

    const response = await POST(
      postRequest({ itemType: "password", ciphertext: "aabbcc", encryptionIv: "112233", wrappedDataKey: "445566" }),
      routeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.item).toEqual(created);
    expect(fakeRepository.createItem).toHaveBeenCalledWith("asset-1", {
      itemType: "password",
      ciphertext: "aabbcc",
      encryptionIv: "112233",
      wrappedDataKey: "445566",
      keyVersion: undefined,
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "vault_item_created", targetId: created.id }),
    );
  });
});
