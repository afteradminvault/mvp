import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VaultKeyRepository } from "@/domain/vault-key/ports";
import { GET, POST } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

const writeAuditLogMock = vi.fn();
vi.mock("@/app/api/_lib/audit-log", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
}));

function createFakeRepository(overrides: Partial<VaultKeyRepository> = {}): VaultKeyRepository {
  return {
    getOwnerVaultKeyState: vi.fn(),
    initializeOwnerVaultKey: vi.fn(),
    ...overrides,
  };
}

let fakeRepository: VaultKeyRepository;
vi.mock("@/infrastructure/vault-key/supabase-vault-key-repository", () => ({
  SupabaseVaultKeyRepository: vi.fn().mockImplementation(function SupabaseVaultKeyRepository() {
    return fakeRepository;
  }),
}));

function routeParams(id = "estate-1") {
  return { params: Promise.resolve({ id }) };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/estates/estate-1/vault-key", {
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

describe("GET /api/estates/:id/vault-key", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
  });

  it("returns the vault key state when the caller is the owner", async () => {
    const state = { wrappedVaultKey: "aabbcc", kdfSalt: "112233" };
    fakeRepository.getOwnerVaultKeyState = vi.fn().mockResolvedValue(state);

    const response = await GET(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.vaultKey).toEqual(state);
  });

  it("returns null fields when the vault hasn't been initialized yet", async () => {
    fakeRepository.getOwnerVaultKeyState = vi.fn().mockResolvedValue({ wrappedVaultKey: null, kdfSalt: null });

    const response = await GET(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.vaultKey).toEqual({ wrappedVaultKey: null, kdfSalt: null });
  });

  it("returns 403 when the caller is not the estate owner", async () => {
    fakeRepository.getOwnerVaultKeyState = vi
      .fn()
      .mockRejectedValue(new Error("only the estate owner can access this estate's vault key"));

    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(403);
  });
});

describe("POST /api/estates/:id/vault-key", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(postRequest({ wrappedVaultKey: "aabbcc" }), routeParams());
    expect(response.status).toBe(401);
    expect(fakeRepository.initializeOwnerVaultKey).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid JSON body", async () => {
    const response = await POST(postRequest("not json"), routeParams());
    expect(response.status).toBe(400);
  });

  it("returns 400 when wrappedVaultKey is missing", async () => {
    const response = await POST(postRequest({}), routeParams());
    expect(response.status).toBe(400);
  });

  it("returns 400 (via the real VaultKeyService validation) for a non-hex wrappedVaultKey", async () => {
    const response = await POST(postRequest({ wrappedVaultKey: "not-hex!" }), routeParams());
    expect(response.status).toBe(400);
    expect(fakeRepository.initializeOwnerVaultKey).not.toHaveBeenCalled();
  });

  it("initializes the vault key, writes an audit log, and returns 201", async () => {
    const state = { wrappedVaultKey: "aabbcc", kdfSalt: "112233" };
    fakeRepository.initializeOwnerVaultKey = vi.fn().mockResolvedValue(state);

    const response = await POST(postRequest({ wrappedVaultKey: "aabbcc", kdfSalt: "112233" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.vaultKey).toEqual(state);
    expect(fakeRepository.initializeOwnerVaultKey).toHaveBeenCalledWith("estate-1", {
      wrappedVaultKey: "aabbcc",
      kdfSalt: "112233",
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ estateId: "estate-1", actorUserId: "user-1", eventType: "vault_key_initialized" }),
    );
  });

  it("returns 409 when the vault key is already initialized", async () => {
    fakeRepository.initializeOwnerVaultKey = vi
      .fn()
      .mockRejectedValue(new Error("vault key already initialized for this estate"));

    const response = await POST(postRequest({ wrappedVaultKey: "aabbcc" }), routeParams());
    expect(response.status).toBe(409);
  });

  it("returns 403 when the caller is not the estate owner", async () => {
    fakeRepository.initializeOwnerVaultKey = vi
      .fn()
      .mockRejectedValue(new Error("only the estate owner can initialize its vault key"));

    const response = await POST(postRequest({ wrappedVaultKey: "aabbcc" }), routeParams());
    expect(response.status).toBe(403);
  });
});
