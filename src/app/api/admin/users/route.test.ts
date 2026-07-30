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
    listUsers: vi.fn().mockResolvedValue({ users: [], total: 0 }),
    getUser: vi.fn(),
    setSuspended: vi.fn(),
    startImpersonation: vi.fn(),
    listImpersonationSessions: vi.fn(),
    endImpersonation: vi.fn(),
  };
  requirePlatformAdminMock.mockResolvedValue({ supabase: {}, userId: "admin-1" });
});

describe("GET /api/admin/users", () => {
  it("returns 401 when the caller isn't an admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await GET(new Request("http://localhost/api/admin/users"));
    expect(response.status).toBe(403);
  });

  it("passes the search query through to the service", async () => {
    await GET(new Request("http://localhost/api/admin/users?search=marcus"));

    expect(fakeRepository.listUsers).toHaveBeenCalledWith({ search: "marcus", limit: 50, offset: 0 });
  });
});
