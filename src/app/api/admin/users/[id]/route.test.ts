import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUser, AdminUserRepository } from "@/domain/admin-users/ports";
import { GET, PATCH } from "./route";

const requirePlatformAdminMock = vi.fn();
vi.mock("@/app/api/_lib/require-platform-admin", () => ({
  requirePlatformAdmin: () => requirePlatformAdminMock(),
}));

const writeAuditLogMock = vi.fn();
vi.mock("@/app/api/_lib/audit-log", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
}));

let fakeRepository: AdminUserRepository;
vi.mock("@/infrastructure/admin-users/supabase-admin-user-repository", () => ({
  SupabaseAdminUserRepository: vi.fn().mockImplementation(function SupabaseAdminUserRepository() {
    return fakeRepository;
  }),
}));

function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "user-1",
    email: "marcus@example.com",
    displayName: "Marcus Whitfield",
    mfaEnabled: false,
    suspendedAt: null,
    createdAt: "2026-08-04T00:00:00.000Z",
    ...overrides,
  };
}

function routeParams(id = "user-1") {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/users/user-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = {
    listUsers: vi.fn(),
    getUser: vi.fn().mockResolvedValue(makeUser()),
    setSuspended: vi.fn().mockResolvedValue(makeUser({ suspendedAt: "2026-08-04T01:00:00.000Z" })),
    startImpersonation: vi.fn(),
    listImpersonationSessions: vi.fn(),
    endImpersonation: vi.fn(),
  };
  requirePlatformAdminMock.mockResolvedValue({ supabase: {}, userId: "admin-1" });
});

describe("GET /api/admin/users/:id", () => {
  it("returns 401 when the caller isn't an admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(403);
  });

  it("returns the user", async () => {
    const response = await GET(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user).toEqual(makeUser());
  });
});

describe("PATCH /api/admin/users/:id", () => {
  it("suspends the user, writes an audit log, and returns 200", async () => {
    const response = await PATCH(patchRequest({ suspended: true }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.suspendedAt).not.toBeNull();
    expect(fakeRepository.setSuspended).toHaveBeenCalledWith("user-1", true);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "admin_user_suspended", estateId: null }),
    );
  });

  it("returns 400 for a non-boolean suspended value", async () => {
    const response = await PATCH(patchRequest({ suspended: "yes" }), routeParams());
    expect(response.status).toBe(400);
    expect(fakeRepository.setSuspended).not.toHaveBeenCalled();
  });
});
