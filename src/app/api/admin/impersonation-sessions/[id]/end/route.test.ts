import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUserRepository } from "@/domain/admin-users/ports";
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

function routeParams(id = "session-1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = {
    listUsers: vi.fn(),
    getUser: vi.fn(),
    setSuspended: vi.fn(),
    startImpersonation: vi.fn(),
    listImpersonationSessions: vi.fn(),
    endImpersonation: vi.fn().mockResolvedValue(undefined),
  };
  requirePlatformAdminMock.mockResolvedValue({ supabase: {}, userId: "admin-1" });
});

describe("POST /api/admin/impersonation-sessions/:id/end", () => {
  it("returns 401 when the caller isn't an admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await POST(new Request("http://localhost", { method: "POST" }), routeParams());
    expect(response.status).toBe(403);
    expect(fakeRepository.endImpersonation).not.toHaveBeenCalled();
  });

  it("ends the session, writes an audit log, and returns ok", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(fakeRepository.endImpersonation).toHaveBeenCalledWith("session-1");
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "admin_impersonation_ended" }),
    );
  });
});
