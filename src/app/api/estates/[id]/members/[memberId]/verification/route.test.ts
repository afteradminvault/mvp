import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutorVerification, ExecutorVerificationRepository } from "@/domain/executor-verification/ports";
import { GET } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

function createFakeRepository(overrides: Partial<ExecutorVerificationRepository> = {}): ExecutorVerificationRepository {
  return {
    getVerification: vi.fn(),
    uploadIdDocument: vi.fn(),
    acceptLegalTerms: vi.fn(),
    decide: vi.fn(),
    ...overrides,
  };
}

let fakeRepository: ExecutorVerificationRepository;
vi.mock("@/infrastructure/executor-verification/supabase-executor-verification-repository", () => ({
  SupabaseExecutorVerificationRepository: vi.fn().mockImplementation(function SupabaseExecutorVerificationRepository() {
    return fakeRepository;
  }),
}));

function makeVerification(overrides: Partial<ExecutorVerification> = {}): ExecutorVerification {
  return {
    id: "verification-1",
    estateId: "estate-1",
    memberId: "member-1",
    status: "pending",
    idDocumentStoragePath: null,
    legalTermsAcceptedAt: null,
    familyApprovedAt: null,
    familyApprovedByUserId: null,
    familyDeclinedAt: null,
    familyDeclinedByUserId: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function routeParams(id = "estate-1", memberId = "member-1") {
  return { params: Promise.resolve({ id, memberId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = createFakeRepository();
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("GET /api/estates/:id/members/:memberId/verification", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
  });

  it("returns 404 when there is no verification record yet", async () => {
    fakeRepository.getVerification = vi.fn().mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(404);
  });

  it("returns the verification record", async () => {
    const verification = makeVerification({ status: "terms_accepted" });
    fakeRepository.getVerification = vi.fn().mockResolvedValue(verification);

    const response = await GET(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.verification).toEqual(verification);
  });
});
