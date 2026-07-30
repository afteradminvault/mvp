import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUser, AdminUserRepository, ImpersonationSession } from "@/domain/admin-users/ports";
import { POST } from "./route";

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

function makeSession(overrides: Partial<ImpersonationSession> = {}): ImpersonationSession {
  return {
    id: "session-1",
    adminUserId: "admin-1",
    targetUserId: "user-1",
    startedAt: "2026-08-04T00:00:00.000Z",
    endedAt: null,
    actionLink: "https://project.supabase.co/auth/v1/verify?token=abc&type=magiclink",
    ...overrides,
  };
}

function routeParams(id = "user-1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = {
    listUsers: vi.fn(),
    getUser: vi.fn().mockResolvedValue(makeUser()),
    setSuspended: vi.fn(),
    startImpersonation: vi.fn().mockResolvedValue(makeSession()),
    listImpersonationSessions: vi.fn(),
    endImpersonation: vi.fn(),
  };
  requirePlatformAdminMock.mockResolvedValue({ supabase: {}, userId: "admin-1" });
});

describe("POST /api/admin/users/:id/impersonate", () => {
  it("returns 401 when the caller isn't an admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await POST(new Request("http://localhost", { method: "POST" }), routeParams());
    expect(response.status).toBe(403);
    expect(fakeRepository.startImpersonation).not.toHaveBeenCalled();
  });

  it("returns 404 when the target user doesn't exist", async () => {
    fakeRepository.getUser = vi.fn().mockResolvedValue(null);

    const response = await POST(new Request("http://localhost", { method: "POST" }), routeParams());
    expect(response.status).toBe(404);
  });

  it("starts an impersonation session, writes an audit log, and returns 201 with only the action link + bookkeeping fields", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.impersonationSession).toEqual(makeSession());
    expect(fakeRepository.startImpersonation).toHaveBeenCalledWith("admin-1", "user-1");
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "admin_impersonation_started", targetId: "user-1" }),
    );
  });
});
