import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DigitalAsset, DigitalAssetRepository } from "@/domain/assets/ports";
import type { Document, DocumentRepository } from "@/domain/documents/ports";
import type { EstateMember, MembershipRepository } from "@/domain/membership/ports";
import { GET } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

let fakeAssetRepository: DigitalAssetRepository;
vi.mock("@/infrastructure/assets/supabase-asset-repository", () => ({
  SupabaseDigitalAssetRepository: vi.fn().mockImplementation(function SupabaseDigitalAssetRepository() {
    return fakeAssetRepository;
  }),
}));

let fakeDocumentRepository: DocumentRepository;
vi.mock("@/infrastructure/documents/supabase-document-repository", () => ({
  SupabaseDocumentRepository: vi.fn().mockImplementation(function SupabaseDocumentRepository() {
    return fakeDocumentRepository;
  }),
}));

let fakeMembershipRepository: MembershipRepository;
vi.mock("@/infrastructure/membership/supabase-membership-repository", () => ({
  SupabaseMembershipRepository: vi.fn().mockImplementation(function SupabaseMembershipRepository() {
    return fakeMembershipRepository;
  }),
}));

function makeAsset(overrides: Partial<DigitalAsset> = {}): DigitalAsset {
  return {
    id: "asset-1",
    estateId: "estate-1",
    category: "financial",
    providerId: null,
    customProviderName: "Chase",
    accountIdentifier: null,
    intendedOutcome: "close",
    intendedOutcomeNotes: null,
    estimatedValueCents: null,
    currency: null,
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    estateId: "estate-1",
    uploadedByUserId: "user-1",
    documentType: "death_certificate",
    storagePath: "estate-1/doc-1",
    fileName: "certificate.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 1024,
    isCertifiedOriginal: false,
    notes: null,
    uploadedAt: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

function makeMember(overrides: Partial<EstateMember> = {}): EstateMember {
  return {
    id: "member-1",
    estateId: "estate-1",
    userId: "user-2",
    role: "executor",
    inviteEmail: "executor@example.com",
    inviteStatus: "pending",
    invitedAt: "2026-07-30T00:00:00.000Z",
    acceptedAt: null,
    fallbackOrder: null,
    hasWrappedVaultKey: false,
    createdAt: "2026-07-30T00:00:00.000Z",
    inviteToken: null,
    ...overrides,
  };
}

function routeParams(id = "estate-1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeAssetRepository = {
    createAsset: vi.fn(),
    getAsset: vi.fn(),
    updateAsset: vi.fn(),
    archiveAsset: vi.fn(),
    listAssets: vi.fn().mockResolvedValue([]),
  };
  fakeDocumentRepository = {
    listDocuments: vi.fn().mockResolvedValue([]),
    getDocument: vi.fn(),
    uploadDocument: vi.fn(),
    createSignedDownloadUrl: vi.fn(),
    deleteDocument: vi.fn(),
    isAttachedToAnyClosureRequest: vi.fn(),
    activateExecutorIfCertified: vi.fn(),
  };
  fakeMembershipRepository = {
    inviteMember: vi.fn(),
    listMembers: vi.fn().mockResolvedValue([]),
    getInvitePreview: vi.fn(),
    acceptInvite: vi.fn(),
    getMemberPublicKeys: vi.fn(),
    wrapKeyShareForMember: vi.fn(),
    revokeMember: vi.fn(),
  };
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("GET /api/cases/:id/summary", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
  });

  it("reports zero accounts, no certificate, and no executor for a fresh case", async () => {
    const response = await GET(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary).toEqual({ accountCount: 0, hasDeathCertificate: false, executorInvited: false });
  });

  it("reflects accounts, a death certificate, and an invited executor", async () => {
    fakeAssetRepository.listAssets = vi.fn().mockResolvedValue([makeAsset(), makeAsset({ id: "asset-2" })]);
    fakeDocumentRepository.listDocuments = vi.fn().mockResolvedValue([makeDocument()]);
    fakeMembershipRepository.listMembers = vi.fn().mockResolvedValue([makeMember()]);

    const response = await GET(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(body.summary).toEqual({ accountCount: 2, hasDeathCertificate: true, executorInvited: true });
  });
});
