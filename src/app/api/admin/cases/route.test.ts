import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminCaseRepository } from "@/domain/admin-cases/ports";
import { GET } from "./route";

const requirePlatformAdminMock = vi.fn();
vi.mock("@/app/api/_lib/require-platform-admin", () => ({
  requirePlatformAdmin: () => requirePlatformAdminMock(),
}));

let fakeRepository: AdminCaseRepository;
vi.mock("@/infrastructure/admin-cases/supabase-admin-case-repository", () => ({
  SupabaseAdminCaseRepository: vi.fn().mockImplementation(function SupabaseAdminCaseRepository() {
    return fakeRepository;
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = { listCases: vi.fn().mockResolvedValue({ cases: [], total: 0 }), flagCase: vi.fn() };
  requirePlatformAdminMock.mockResolvedValue({ supabase: {}, userId: "admin-1" });
});

describe("GET /api/admin/cases", () => {
  it("returns 401 when the caller isn't an admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await GET(new Request("http://localhost/api/admin/cases"));
    expect(response.status).toBe(403);
  });

  it("filters to flagged=true when requested", async () => {
    await GET(new Request("http://localhost/api/admin/cases?flagged=true"));

    expect(fakeRepository.listCases).toHaveBeenCalledWith({ flaggedOnly: true, limit: 50, offset: 0 });
  });
});
