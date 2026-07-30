import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VaultPreviewLetter, VaultPreviewLetterRepository } from "@/domain/vault-preview-letters/ports";
import type { DigitalAsset, DigitalAssetRepository } from "@/domain/assets/ports";
import type { DigitalVaultItem, VaultItemRepository } from "@/domain/vault-items/ports";
import { GET, POST } from "./route";

const requireSessionMock = vi.fn();
vi.mock("@/app/api/_lib/require-session", () => ({
  requireSession: () => requireSessionMock(),
}));

const writeAuditLogMock = vi.fn();
vi.mock("@/app/api/_lib/audit-log", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
}));

let fakeLetterRepository: VaultPreviewLetterRepository;
vi.mock("@/infrastructure/vault-preview-letters/supabase-vault-preview-letter-repository", () => ({
  SupabaseVaultPreviewLetterRepository: vi.fn().mockImplementation(function SupabaseVaultPreviewLetterRepository() {
    return fakeLetterRepository;
  }),
}));

let fakeAssetRepository: DigitalAssetRepository;
vi.mock("@/infrastructure/assets/supabase-asset-repository", () => ({
  SupabaseDigitalAssetRepository: vi.fn().mockImplementation(function SupabaseDigitalAssetRepository() {
    return fakeAssetRepository;
  }),
}));

let fakeVaultItemRepository: VaultItemRepository;
vi.mock("@/infrastructure/vault-items/supabase-vault-item-repository", () => ({
  SupabaseVaultItemRepository: vi.fn().mockImplementation(function SupabaseVaultItemRepository() {
    return fakeVaultItemRepository;
  }),
}));

function makeLetter(overrides: Partial<VaultPreviewLetter> = {}): VaultPreviewLetter {
  return {
    id: "letter-1",
    estateId: "estate-1",
    generatedByUserId: "user-1",
    itemTypeSummary: { password: 2 },
    generatedAt: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

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
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

function makeVaultItem(overrides: Partial<DigitalVaultItem> = {}): DigitalVaultItem {
  return {
    id: "item-1",
    digitalAssetId: "asset-1",
    itemType: "password",
    ciphertext: "aabbcc",
    encryptionIv: "112233",
    wrappedDataKey: "445566",
    keyVersion: 1,
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

function routeParams(id = "estate-1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeLetterRepository = {
    createLetter: vi.fn().mockResolvedValue(makeLetter()),
    listLetters: vi.fn().mockResolvedValue([]),
    getLetter: vi.fn(),
  };
  fakeAssetRepository = {
    createAsset: vi.fn(),
    getAsset: vi.fn(),
    updateAsset: vi.fn(),
    archiveAsset: vi.fn(),
    listAssets: vi.fn().mockResolvedValue([makeAsset()]),
  };
  fakeVaultItemRepository = {
    createItem: vi.fn(),
    listItems: vi.fn().mockResolvedValue([makeVaultItem()]),
    getItem: vi.fn(),
    rotateItem: vi.fn(),
    deleteItem: vi.fn(),
  };
  requireSessionMock.mockResolvedValue({ supabase: {}, userId: "user-1" });
});

describe("GET /api/cases/:id/vault-preview-letter", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await GET(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
  });

  it("returns previously-generated letters for the case", async () => {
    const letters = [makeLetter()];
    fakeLetterRepository.listLetters = vi.fn().mockResolvedValue(letters);

    const response = await GET(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.letters).toEqual(letters);
  });
});

describe("POST /api/cases/:id/vault-preview-letter", () => {
  it("returns 401 when there is no session", async () => {
    requireSessionMock.mockResolvedValue({ unauthorized: NextResponse.json({ error: "nope" }, { status: 401 }) });

    const response = await POST(new Request("http://localhost"), routeParams());
    expect(response.status).toBe(401);
    expect(fakeLetterRepository.createLetter).not.toHaveBeenCalled();
  });

  it("generates a letter, writes an audit log, and returns 201", async () => {
    const created = makeLetter();
    fakeLetterRepository.createLetter = vi.fn().mockResolvedValue(created);

    const response = await POST(new Request("http://localhost"), routeParams());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.letter).toEqual(created);
    expect(fakeLetterRepository.createLetter).toHaveBeenCalledWith("estate-1", "user-1", { password: 1 });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "vault_preview_letter_generated", targetId: created.id }),
    );
  });
});
