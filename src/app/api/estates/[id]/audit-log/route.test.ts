import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditLogEntry, AuditLogListResult, AuditLogRepository } from "@/domain/audit-logs/ports";
import { GET } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

function createFakeRepository(overrides: Partial<AuditLogRepository> = {}): AuditLogRepository {
  return {
    listAuditLogs: vi.fn(),
    listAllAuditLogs: vi.fn(),
    ...overrides,
  };
}

let fakeRepository: AuditLogRepository;
vi.mock("@/infrastructure/audit-logs/supabase-audit-log-repository", () => ({
  SupabaseAuditLogRepository: vi.fn().mockImplementation(function SupabaseAuditLogRepository() {
    return fakeRepository;
  }),
}));

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: "log-1",
    estateId: "estate-1",
    actorUserId: "user-1",
    eventType: "vault_item_viewed",
    targetTable: "digital_vault_items",
    targetId: "item-1",
    metadata: null,
    ipAddress: null,
    createdAt: "2026-07-24T00:00:00.000Z",
    ...overrides,
  };
}

function makeResult(overrides: Partial<AuditLogListResult> = {}): AuditLogListResult {
  return {
    entries: [makeEntry()],
    total: 1,
    ...overrides,
  };
}

function routeParams(id = "estate-1") {
  return { params: Promise.resolve({ id }) };
}

function getRequest(query = ""): Request {
  return new Request(`http://localhost/api/estates/estate-1/audit-log${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = createFakeRepository();
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("GET /api/estates/:id/audit-log", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await GET(getRequest(), routeParams());
    expect(response.status).toBe(401);
  });

  it("lists entries with default pagination when no filters are given", async () => {
    const result = makeResult();
    fakeRepository.listAuditLogs = vi.fn().mockResolvedValue(result);

    const response = await GET(getRequest(), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(result);
    expect(fakeRepository.listAuditLogs).toHaveBeenCalledWith("estate-1", {
      eventType: undefined,
      from: undefined,
      to: undefined,
      limit: 50,
      offset: 0,
    });
  });

  it("passes eventType, from, to, limit, and offset query params through", async () => {
    fakeRepository.listAuditLogs = vi.fn().mockResolvedValue(makeResult());

    await GET(
      getRequest("?eventType=vault_item_viewed&from=2026-07-01&to=2026-07-24&limit=10&offset=20"),
      routeParams(),
    );

    expect(fakeRepository.listAuditLogs).toHaveBeenCalledWith("estate-1", {
      eventType: "vault_item_viewed",
      from: "2026-07-01",
      to: "2026-07-24",
      limit: 10,
      offset: 20,
    });
  });

  it("returns 400 (via the real AuditLogService validation) for an invalid date", async () => {
    const response = await GET(getRequest("?from=not-a-date"), routeParams());
    expect(response.status).toBe(400);
    expect(fakeRepository.listAuditLogs).not.toHaveBeenCalled();
  });

  it("returns 400 (via the real AuditLogService validation) for an out-of-range limit", async () => {
    const response = await GET(getRequest("?limit=1000"), routeParams());
    expect(response.status).toBe(400);
    expect(fakeRepository.listAuditLogs).not.toHaveBeenCalled();
  });
});
