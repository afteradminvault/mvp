import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountClosureRequest, ClosureRequestRepository } from "@/domain/closure-requests/ports";
import type { DigitalAssetRepository } from "@/domain/assets/ports";
import type { EstateRepository } from "@/domain/estates/ports";
import type { LegalRequirementRepository } from "@/domain/admin-legal-requirements/ports";
import { POST } from "./route";

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

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/estates/estate-1/closure-requests/request-1/documents", {
    method: "POST",
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
    updateClosureRequest: vi.fn(),
    getDocumentEstateId: vi.fn().mockResolvedValue("estate-1"),
    attachDocument: vi.fn().mockResolvedValue(undefined),
    markStaleRequestsNeedingNudge: vi.fn(),
  };
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "executor-1" });
});

describe("POST /api/estates/:id/closure-requests/:requestId/documents", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });
    const response = await POST(postRequest({ documentId: "doc-1" }), routeParams());
    expect(response.status).toBe(401);
  });

  it("returns 404 when the request doesn't belong to this estate", async () => {
    fakeClosureRequestRepository.getClosureRequest = vi
      .fn()
      .mockResolvedValue(makeClosureRequest({ estateId: "other-estate" }));
    const response = await POST(postRequest({ documentId: "doc-1" }), routeParams());
    expect(response.status).toBe(404);
    expect(fakeClosureRequestRepository.attachDocument).not.toHaveBeenCalled();
  });

  it("returns 400 when the document belongs to a different estate", async () => {
    fakeClosureRequestRepository.getDocumentEstateId = vi.fn().mockResolvedValue("other-estate");
    const response = await POST(postRequest({ documentId: "doc-1" }), routeParams());
    expect(response.status).toBe(400);
    expect(fakeClosureRequestRepository.attachDocument).not.toHaveBeenCalled();
  });

  it("attaches the document, logs it, and returns 201", async () => {
    const response = await POST(postRequest({ documentId: "doc-1" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.closureRequest).toEqual(makeClosureRequest());
    expect(fakeClosureRequestRepository.attachDocument).toHaveBeenCalledWith("request-1", "doc-1");
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "closure_request_document_attached", targetId: "request-1" }),
    );
  });
});
