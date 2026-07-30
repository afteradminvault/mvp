import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUserRepository } from "@/domain/admin-users/ports";
import { GET } from "./route";

const requirePlatformAdminMock = vi.fn();
vi.mock("@/app/api/_lib/require-platform-admin", () => ({
  requirePlatformAdmin: () => requirePlatformAdminMock(),
}));

let fakeRepository: AdminUserRepository;
vi.mock("@/infrastructure/admin-users/supabase-admin-user-repository", () => ({
  SupabaseAdminUserRepository: vi.fn().mockImplementation(function SupabaseAdminUserRepository() {
    return fakeRepository;
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = {
    listUsers: vi.fn(),
    getUser: vi.fn(),
    setSuspended: vi.fn(),
    startImpersonation: vi.fn(),
    listImpersonationSessions: vi.fn().mockResolvedValue([]),
    endImpersonation: vi.fn(),
  };
  requirePlatformAdminMock.mockResolvedValue({ supabase: {}, userId: "admin-1" });
});

describe("GET /api/admin/impersonation-sessions", () => {
  it("returns 401 when the caller isn't an admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await GET();
    expect(response.status).toBe(403);
  });

  it("returns the sessions list, never including an actionLink field", async () => {
    const sessions = [
      { id: "session-1", adminUserId: "admin-1", targetUserId: "user-1", startedAt: "2026-08-04T00:00:00.000Z", endedAt: null },
    ];
    fakeRepository.listImpersonationSessions = vi.fn().mockResolvedValue(sessions);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessions).toEqual(sessions);
    expect(JSON.stringify(body.sessions)).not.toContain("actionLink");
  });
});
