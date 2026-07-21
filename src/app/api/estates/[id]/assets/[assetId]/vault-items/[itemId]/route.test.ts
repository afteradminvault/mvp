import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DigitalVaultItem, VaultItemRepository } from "@/domain/vault-items/ports";
import { DELETE, PATCH } from "./route";

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

function routeParams(id = "estate-1", assetId = "asset-1", itemId = "item-1") {
  return { params: Promise.resolve({ id, assetId, itemId }) };
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/estates/estate-1/assets/asset-1/vault-items/item-1", {
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

describe("PATCH /api/estates/:id/assets/:assetId/vault-items/:itemId (rotate)", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await PATCH(
      patchRequest({ ciphertext: "aabbcc", encryptionIv: "112233", wrappedDataKey: "445566" }),
      routeParams(),
    );
    expect(response.status).toBe(401);
    expect(fakeRepository.rotateItem).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid JSON body", async () => {
    const response = await PATCH(patchRequest("not json"), routeParams());
    expect(response.status).toBe(400);
  });

  it("returns 400 when a required field is missing", async () => {
    const response = await PATCH(patchRequest({ ciphertext: "aabbcc" }), routeParams());
    expect(response.status).toBe(400);
  });

  it("returns 404 when the item belongs to a different asset than the URL claims", async () => {
    const item = makeItem({ digitalAssetId: "some-other-asset" });
    fakeRepository.getItem = vi.fn().mockResolvedValue(item);

    const response = await PATCH(
      patchRequest({ ciphertext: "aabbcc", encryptionIv: "112233", wrappedDataKey: "445566" }),
      routeParams(),
    );
    expect(response.status).toBe(404);
    expect(fakeRepository.rotateItem).not.toHaveBeenCalled();
  });

  it("rotates the item with a fresh DEK's wrapped material, writes an audit log, and returns 200", async () => {
    const existing = makeItem();
    const rotated = makeItem({ ciphertext: "ffee00" });
    fakeRepository.getItem = vi.fn().mockResolvedValue(existing);
    fakeRepository.rotateItem = vi.fn().mockResolvedValue(rotated);

    const response = await PATCH(
      patchRequest({ ciphertext: "ffee00", encryptionIv: "112233", wrappedDataKey: "445566" }),
      routeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.item).toEqual(rotated);
    expect(fakeRepository.rotateItem).toHaveBeenCalledWith("item-1", {
      ciphertext: "ffee00",
      encryptionIv: "112233",
      wrappedDataKey: "445566",
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "vault_item_rotated", targetId: "item-1" }),
    );
  });
});

describe("DELETE /api/estates/:id/assets/:assetId/vault-items/:itemId", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await DELETE(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
    expect(fakeRepository.deleteItem).not.toHaveBeenCalled();
  });

  it("returns 404 when the item belongs to a different asset than the URL claims", async () => {
    const item = makeItem({ digitalAssetId: "some-other-asset" });
    fakeRepository.getItem = vi.fn().mockResolvedValue(item);

    const response = await DELETE(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(404);
    expect(fakeRepository.deleteItem).not.toHaveBeenCalled();
  });

  it("hard-deletes the item, writes an audit log, and returns success", async () => {
    const existing = makeItem();
    fakeRepository.getItem = vi.fn().mockResolvedValue(existing);
    fakeRepository.deleteItem = vi.fn().mockResolvedValue(undefined);

    const response = await DELETE(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(fakeRepository.deleteItem).toHaveBeenCalledWith("item-1");
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "vault_item_deleted", targetId: "item-1" }),
    );
  });
});
