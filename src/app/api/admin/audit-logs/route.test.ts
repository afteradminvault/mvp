import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditLogRepository } from "@/domain/audit-logs/ports";
import { GET } from "./route";

const requirePlatformAdminMock = vi.fn();
vi.mock("@/app/api/_lib/require-platform-admin", () => ({
  requirePlatformAdmin: () => requirePlatformAdminMock(),
}));

let fakeRepository: AuditLogRepository;
vi.mock("@/infrastructure/audit-logs/supabase-audit-log-repository", () => ({
  SupabaseAuditLogRepository: vi.fn().mockImplementation(function SupabaseAuditLogRepository() {
    return fakeRepository;
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = {
    listAuditLogs: vi.fn(),
    listAllAuditLogs: vi.fn().mockResolvedValue({ entries: [], total: 0 }),
  };
  requirePlatformAdminMock.mockResolvedValue({ supabase: {}, userId: "admin-1" });
});

describe("GET /api/admin/audit-logs", () => {
  it("returns 401 when the caller isn't an admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await GET(new Request("http://localhost/api/admin/audit-logs"));
    expect(response.status).toBe(403);
  });

  it("passes eventType/actorUserId/from/to filters through with no estate scoping", async () => {
    await GET(
      new Request(
        "http://localhost/api/admin/audit-logs?eventType=admin_case_flagged&actorUserId=admin-1&from=2026-08-01&to=2026-08-04",
      ),
    );

    expect(fakeRepository.listAllAuditLogs).toHaveBeenCalledWith({
      eventType: "admin_case_flagged",
      actorUserId: "admin-1",
      from: "2026-08-01",
      to: "2026-08-04",
      limit: 50,
      offset: 0,
    });
  });
});
