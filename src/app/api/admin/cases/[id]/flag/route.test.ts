import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminCaseRepository, AdminCaseSummary } from "@/domain/admin-cases/ports";
import { POST } from "./route";

const requirePlatformAdminMock = vi.fn();
vi.mock("@/app/api/_lib/require-platform-admin", () => ({
  requirePlatformAdmin: () => requirePlatformAdminMock(),
}));

const writeAuditLogMock = vi.fn();
vi.mock("@/app/api/_lib/audit-log", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
}));

let fakeRepository: AdminCaseRepository;
vi.mock("@/infrastructure/admin-cases/supabase-admin-case-repository", () => ({
  SupabaseAdminCaseRepository: vi.fn().mockImplementation(function SupabaseAdminCaseRepository() {
    return fakeRepository;
  }),
}));

function makeCase(overrides: Partial<AdminCaseSummary> = {}): AdminCaseSummary {
  return {
    id: "case-1",
    displayName: "Diane Whitfield's Case",
    status: "active_living",
    flagged: true,
    flaggedNotes: "Repeated failed logins.",
    createdAt: "2026-08-04T00:00:00.000Z",
    ...overrides,
  };
}

function routeParams(id = "case-1") {
  return { params: Promise.resolve({ id }) };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/cases/case-1/flag", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = { listCases: vi.fn(), flagCase: vi.fn().mockResolvedValue(makeCase()) };
  requirePlatformAdminMock.mockResolvedValue({ supabase: {}, userId: "admin-1" });
});

describe("POST /api/admin/cases/:id/flag", () => {
  it("returns 401 when the caller isn't an admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await POST(postRequest({ flagged: true }), routeParams());
    expect(response.status).toBe(403);
    expect(fakeRepository.flagCase).not.toHaveBeenCalled();
  });

  it("flags the case, writes an audit log, and returns 200", async () => {
    const response = await POST(postRequest({ flagged: true, flaggedNotes: "Repeated failed logins." }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.case).toEqual(makeCase());
    expect(fakeRepository.flagCase).toHaveBeenCalledWith("case-1", { flagged: true, flaggedNotes: "Repeated failed logins." });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "admin_case_flagged", estateId: "case-1" }),
    );
  });

  it("returns 400 for a non-boolean flagged value", async () => {
    const response = await POST(postRequest({ flagged: "yes" }), routeParams());
    expect(response.status).toBe(400);
  });
});
