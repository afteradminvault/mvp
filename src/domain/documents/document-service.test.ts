import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Estate } from "@/domain/estates/ports";
import {
  DocumentAttachedError,
  DocumentForbiddenError,
  DocumentNotFoundError,
  DocumentService,
  InvalidDocumentInputError,
  MAX_DOCUMENT_SIZE_BYTES,
} from "./document-service";
import type { Document, DocumentRepository, UploadDocumentInput } from "./ports";

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
    uploadedAt: "2026-07-24T00:00:00.000Z",
    ...overrides,
  };
}

function makeEstate(overrides: Partial<Estate> = {}): Estate {
  return {
    id: "estate-1",
    ownerUserId: "owner-1",
    jurisdictionId: "jurisdiction-1",
    displayName: "Diane's Estate",
    status: "active_executor",
    checkInIntervalDays: 90,
    lastCheckInAt: "2026-07-24T00:00:00.000Z",
    gracePeriodDays: 14,
    verificationStartedAt: null,
    selfCancelWindowDays: 7,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    closedAt: null,
    deceasedFullName: null,
    deceasedDateOfBirth: null,
    deceasedRelationship: null,
    deceasedDateOfDeath: null,
    draftStep: null,
    draftPayload: {},
    isSelfPlanned: false,
    ...overrides,
  };
}

function validUploadInput(overrides: Partial<UploadDocumentInput> = {}): UploadDocumentInput {
  return {
    documentType: "death_certificate",
    fileName: "certificate.pdf",
    mimeType: "application/pdf",
    fileBytes: new Uint8Array([1, 2, 3]),
    ...overrides,
  };
}

function createFakeRepository(overrides: Partial<DocumentRepository> = {}): DocumentRepository {
  return {
    listDocuments: vi.fn(),
    getDocument: vi.fn(),
    uploadDocument: vi.fn(),
    createSignedDownloadUrl: vi.fn(),
    deleteDocument: vi.fn(),
    isAttachedToAnyClosureRequest: vi.fn(),
    activateExecutorIfCertified: vi.fn(),
    ...overrides,
  };
}

describe("DocumentService", () => {
  let repository: DocumentRepository;

  beforeEach(() => {
    repository = createFakeRepository();
  });

  describe("uploadDocument validation", () => {
    it("rejects an invalid documentType", async () => {
      const service = new DocumentService(repository);
      await expect(
        service.uploadDocument("estate-1", "user-1", validUploadInput({ documentType: "not-a-real-type" as never })),
      ).rejects.toThrow(InvalidDocumentInputError);
      expect(repository.uploadDocument).not.toHaveBeenCalled();
    });

    it("rejects a blank fileName", async () => {
      const service = new DocumentService(repository);
      await expect(
        service.uploadDocument("estate-1", "user-1", validUploadInput({ fileName: "  " })),
      ).rejects.toThrow(InvalidDocumentInputError);
    });

    it("rejects a disallowed mime type", async () => {
      const service = new DocumentService(repository);
      await expect(
        service.uploadDocument("estate-1", "user-1", validUploadInput({ mimeType: "application/x-executable" })),
      ).rejects.toThrow(InvalidDocumentInputError);
    });

    it("rejects an empty file", async () => {
      const service = new DocumentService(repository);
      await expect(
        service.uploadDocument("estate-1", "user-1", validUploadInput({ fileBytes: new Uint8Array([]) })),
      ).rejects.toThrow(InvalidDocumentInputError);
    });

    it("rejects a file over the size limit", async () => {
      const service = new DocumentService(repository);
      const oversized = new Uint8Array(MAX_DOCUMENT_SIZE_BYTES + 1);
      await expect(
        service.uploadDocument("estate-1", "user-1", validUploadInput({ fileBytes: oversized })),
      ).rejects.toThrow(InvalidDocumentInputError);
    });

    it("rejects blank notes when provided", async () => {
      const service = new DocumentService(repository);
      await expect(
        service.uploadDocument("estate-1", "user-1", validUploadInput({ notes: "   " })),
      ).rejects.toThrow(InvalidDocumentInputError);
    });
  });

  describe("uploadDocument activation side effect", () => {
    it("attempts activation for a death_certificate upload and returns the activated estate", async () => {
      const document = makeDocument({ documentType: "death_certificate" });
      repository.uploadDocument = vi.fn().mockResolvedValue(document);
      repository.activateExecutorIfCertified = vi.fn().mockResolvedValue(makeEstate());
      const service = new DocumentService(repository);

      const result = await service.uploadDocument("estate-1", "user-1", validUploadInput());

      expect(result.document).toEqual(document);
      expect(result.activatedEstate).toEqual(makeEstate());
      expect(repository.activateExecutorIfCertified).toHaveBeenCalledWith("estate-1");
    });

    it("does not attempt activation for a non-death_certificate upload", async () => {
      const document = makeDocument({ documentType: "letters_testamentary" });
      repository.uploadDocument = vi.fn().mockResolvedValue(document);
      const service = new DocumentService(repository);

      const result = await service.uploadDocument(
        "estate-1",
        "user-1",
        validUploadInput({ documentType: "letters_testamentary" }),
      );

      expect(result.activatedEstate).toBeNull();
      expect(repository.activateExecutorIfCertified).not.toHaveBeenCalled();
    });

    it("returns null (not the document upload itself failing) when activation isn't applicable yet", async () => {
      repository.uploadDocument = vi.fn().mockResolvedValue(makeDocument());
      repository.activateExecutorIfCertified = vi.fn().mockResolvedValue(null);
      const service = new DocumentService(repository);

      const result = await service.uploadDocument("estate-1", "user-1", validUploadInput());
      expect(result.activatedEstate).toBeNull();
      expect(result.document).toEqual(makeDocument());
    });

    it("still returns the uploaded document even if the activation check throws unexpectedly", async () => {
      repository.uploadDocument = vi.fn().mockResolvedValue(makeDocument());
      repository.activateExecutorIfCertified = vi.fn().mockRejectedValue(new Error("unexpected"));
      const service = new DocumentService(repository);

      const result = await service.uploadDocument("estate-1", "user-1", validUploadInput());
      expect(result.document).toEqual(makeDocument());
      expect(result.activatedEstate).toBeNull();
    });
  });

  describe("deleteDocument", () => {
    it("refuses to delete a document attached to a closure request", async () => {
      repository.isAttachedToAnyClosureRequest = vi.fn().mockResolvedValue(true);
      const service = new DocumentService(repository);

      await expect(service.deleteDocument("estate-1", "doc-1")).rejects.toThrow(DocumentAttachedError);
      expect(repository.deleteDocument).not.toHaveBeenCalled();
    });

    it("deletes when not attached to any closure request", async () => {
      repository.isAttachedToAnyClosureRequest = vi.fn().mockResolvedValue(false);
      repository.deleteDocument = vi.fn().mockResolvedValue(undefined);
      const service = new DocumentService(repository);

      await service.deleteDocument("estate-1", "doc-1");
      expect(repository.deleteDocument).toHaveBeenCalledWith("estate-1", "doc-1");
    });
  });

  describe("getSignedDownloadUrl", () => {
    it("throws DocumentNotFoundError when the repository returns null", async () => {
      repository.createSignedDownloadUrl = vi.fn().mockResolvedValue(null);
      const service = new DocumentService(repository);

      await expect(service.getSignedDownloadUrl("estate-1", "doc-1")).rejects.toThrow(DocumentNotFoundError);
    });

    it("returns the signed URL", async () => {
      repository.createSignedDownloadUrl = vi.fn().mockResolvedValue("https://signed.example/url");
      const service = new DocumentService(repository);

      const url = await service.getSignedDownloadUrl("estate-1", "doc-1");
      expect(url).toBe("https://signed.example/url");
    });
  });

  describe("activateExecutorIfCertified", () => {
    it("translates the authorization failure into DocumentForbiddenError", async () => {
      repository.activateExecutorIfCertified = vi
        .fn()
        .mockRejectedValue(new Error("only the owner or an accepted executor may activate executor access"));
      const service = new DocumentService(repository);

      await expect(service.activateExecutorIfCertified("estate-1")).rejects.toThrow(DocumentForbiddenError);
    });

    it("returns null when the gate isn't open yet", async () => {
      repository.activateExecutorIfCertified = vi.fn().mockResolvedValue(null);
      const service = new DocumentService(repository);

      const result = await service.activateExecutorIfCertified("estate-1");
      expect(result).toBeNull();
    });
  });
});
