import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountClosureRequest, ClosureRequestRepository } from "@/domain/closure-requests/ports";
import type { DigitalAssetRepository } from "@/domain/assets/ports";
import type { EstateRepository } from "@/domain/estates/ports";
import type { LegalRequirementRepository } from "@/domain/admin-legal-requirements/ports";
import { PATCH } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

const writeAuditLogMock = vi.fn();
vi.mock("@/app/api/_lib/audit-log", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
}));

function makeClosureRequest(overrides: Partial<AccountClosureRequest> = {}): AccountClosureRequest {
  return {
    id: "request-1",
    digitalAssetId: "asset-1",
    estateId: "estate-1",
    status: "not_started",
    assignedToUserId: null,
    legalRequirementSnapshot: [],
    lastStatusChangeAt: "2026-07-25T00:00:00.000Z",
    resolvedAt: null,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    ...overrides,
  };
}

let fakeClosureRequestRepository: ClosureRequestRepository;
vi.mock("@/infrastructure/closure-requests/supabase-closure-request-repository", () => ({
  SupabaseClosureRequestRepository: vi.fn().mockImplementation(function SupabaseClosureRequestRepository() {
    return fakeClosureRequestRepository;
  }),
}));
vi.mock("@/infrastructure/assets/supabase-asset-repository", () => ({
  SupabaseDigitalAssetRepository: vi.fn().mockImplementation(function SupabaseDigitalAssetRepository() {
    return {} as DigitalAssetRepository;
  }),
}));
vi.mock("@/infrastructure/estates/supabase-estate-repository", () => ({
  SupabaseEstateRepository: vi.fn().mockImplementation(function SupabaseEstateRepository() {
    return {} as EstateRepository;
  }),
}));
vi.mock("@/infrastructure/admin-legal-requirements/supabase-admin-legal-requirement-repository", () => ({
  SupabaseAdminLegalRequirementRepository: vi
    .fn()
    .mockImplementation(function SupabaseAdminLegalRequirementRepository() {
      return {} as LegalRequirementRepository;
    }),
}));

function routeParams(id = "estate-1", requestId = "request-1") {
  return { params: Promise.resolve({ id, requestId }) };
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/estates/estate-1/closure-requests/request-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeClosureRequestRepository = {
    createClosureRequest: vi.fn(),
    getClosureRequest: vi.fn().mockResolvedValue(makeClosureRequest()),
    listClosureRequests: vi.fn(),
    updateClosureRequest: vi.fn().mockResolvedValue(makeClosureRequest({ status: "submitted" })),
    getDocumentEstateId: vi.fn(),
    attachDocument: vi.fn(),
    markStaleRequestsNeedingNudge: vi.fn(),
  };
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "executor-1" });
});

describe("PATCH /api/estates/:id/closure-requests/:requestId", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });
    const response = await PATCH(patchRequest({ status: "submitted" }), routeParams());
    expect(response.status).toBe(401);
  });

  it("returns 404 when the request doesn't belong to this estate", async () => {
    fakeClosureRequestRepository.getClosureRequest = vi
      .fn()
      .mockResolvedValue(makeClosureRequest({ estateId: "other-estate" }));
    const response = await PATCH(patchRequest({ status: "submitted" }), routeParams());
    expect(response.status).toBe(404);
    expect(fakeClosureRequestRepository.updateClosureRequest).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid status", async () => {
    const response = await PATCH(patchRequest({ status: "not-a-real-status" }), routeParams());
    expect(response.status).toBe(400);
  });

  it("updates the status, logs closure_request_status_changed, and returns 200", async () => {
    const response = await PATCH(patchRequest({ status: "submitted" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.closureRequest.status).toBe("submitted");
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "closure_request_status_changed", targetId: "request-1" }),
    );
  });

  it("updates assignedToUserId without logging a status change", async () => {
    fakeClosureRequestRepository.updateClosureRequest = vi
      .fn()
      .mockResolvedValue(makeClosureRequest({ assignedToUserId: "user-2" }));
    const response = await PATCH(patchRequest({ assignedToUserId: "user-2" }), routeParams());

    expect(response.status).toBe(200);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
