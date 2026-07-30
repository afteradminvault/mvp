import { describe, expect, it, vi } from "vitest";
import type { ExecutorVerification, ExecutorVerificationRepository } from "./ports";
import {
  ExecutorVerificationForbiddenError,
  ExecutorVerificationNotFoundError,
  ExecutorVerificationService,
  InvalidExecutorVerificationInputError,
} from "./executor-verification-service";

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

function createFakeRepository(overrides: Partial<ExecutorVerificationRepository> = {}): ExecutorVerificationRepository {
  return {
    getVerification: vi.fn(),
    uploadIdDocument: vi.fn(),
    acceptLegalTerms: vi.fn(),
    decide: vi.fn(),
    ...overrides,
  };
}

describe("ExecutorVerificationService.getVerification", () => {
  it("returns the verification record when found", async () => {
    const verification = makeVerification();
    const repository = createFakeRepository({ getVerification: vi.fn().mockResolvedValue(verification) });
    const service = new ExecutorVerificationService(repository);

    await expect(service.getVerification("estate-1", "member-1")).resolves.toBe(verification);
  });

  it("throws ExecutorVerificationNotFoundError when there is no record yet", async () => {
    const repository = createFakeRepository({ getVerification: vi.fn().mockResolvedValue(null) });
    const service = new ExecutorVerificationService(repository);

    await expect(service.getVerification("estate-1", "member-1")).rejects.toThrow(ExecutorVerificationNotFoundError);
  });
});

describe("ExecutorVerificationService.uploadIdDocument", () => {
  it("uploads a well-formed id document", async () => {
    const verification = makeVerification({ status: "id_uploaded", idDocumentStoragePath: "estate-1/executor-verification/member-1" });
    const repository = createFakeRepository({ uploadIdDocument: vi.fn().mockResolvedValue(verification) });
    const service = new ExecutorVerificationService(repository);

    const result = await service.uploadIdDocument("estate-1", "member-1", {
      fileName: "id.jpg",
      mimeType: "image/jpeg",
      fileBytes: new Uint8Array([1, 2, 3]),
    });

    expect(repository.uploadIdDocument).toHaveBeenCalledWith("estate-1", "member-1", {
      fileName: "id.jpg",
      mimeType: "image/jpeg",
      fileBytes: new Uint8Array([1, 2, 3]),
    });
    expect(result).toBe(verification);
  });

  it("rejects a disallowed mime type", async () => {
    const repository = createFakeRepository();
    const service = new ExecutorVerificationService(repository);

    await expect(
      service.uploadIdDocument("estate-1", "member-1", {
        fileName: "id.exe",
        mimeType: "application/x-msdownload",
        fileBytes: new Uint8Array([1]),
      }),
    ).rejects.toThrow(InvalidExecutorVerificationInputError);
  });

  it("rejects an empty file", async () => {
    const repository = createFakeRepository();
    const service = new ExecutorVerificationService(repository);

    await expect(
      service.uploadIdDocument("estate-1", "member-1", {
        fileName: "id.jpg",
        mimeType: "image/jpeg",
        fileBytes: new Uint8Array([]),
      }),
    ).rejects.toThrow(InvalidExecutorVerificationInputError);
  });

  it("translates a repository forbidden error", async () => {
    const repository = createFakeRepository({
      uploadIdDocument: vi.fn().mockRejectedValue(new Error("only the nominated executor may upload their own verification id")),
    });
    const service = new ExecutorVerificationService(repository);

    await expect(
      service.uploadIdDocument("estate-1", "member-1", {
        fileName: "id.jpg",
        mimeType: "image/jpeg",
        fileBytes: new Uint8Array([1]),
      }),
    ).rejects.toThrow(ExecutorVerificationForbiddenError);
  });
});

describe("ExecutorVerificationService.acceptLegalTerms", () => {
  it("accepts legal terms", async () => {
    const verification = makeVerification({ status: "terms_accepted", legalTermsAcceptedAt: "2026-08-01T00:00:00.000Z" });
    const repository = createFakeRepository({ acceptLegalTerms: vi.fn().mockResolvedValue(verification) });
    const service = new ExecutorVerificationService(repository);

    await expect(service.acceptLegalTerms("estate-1", "member-1")).resolves.toBe(verification);
  });

  it("translates a repository not-found error", async () => {
    const repository = createFakeRepository({
      acceptLegalTerms: vi.fn().mockRejectedValue(new Error("executor verification record not found")),
    });
    const service = new ExecutorVerificationService(repository);

    await expect(service.acceptLegalTerms("estate-1", "member-1")).rejects.toThrow(ExecutorVerificationNotFoundError);
  });
});

describe("ExecutorVerificationService.decide", () => {
  it("approves a nominated executor", async () => {
    const verification = makeVerification({ status: "fully_verified", familyApprovedAt: "2026-08-01T00:00:00.000Z" });
    const repository = createFakeRepository({ decide: vi.fn().mockResolvedValue(verification) });
    const service = new ExecutorVerificationService(repository);

    const result = await service.decide("estate-1", "member-1", true);

    expect(repository.decide).toHaveBeenCalledWith("estate-1", "member-1", true);
    expect(result).toBe(verification);
  });

  it("declines a nominated executor — not a silent dead end, status reflects the decision", async () => {
    const verification = makeVerification({ status: "declined", familyDeclinedAt: "2026-08-01T00:00:00.000Z" });
    const repository = createFakeRepository({ decide: vi.fn().mockResolvedValue(verification) });
    const service = new ExecutorVerificationService(repository);

    const result = await service.decide("estate-1", "member-1", false);

    expect(repository.decide).toHaveBeenCalledWith("estate-1", "member-1", false);
    expect(result.status).toBe("declined");
  });

  it("translates a repository forbidden error", async () => {
    const repository = createFakeRepository({
      decide: vi.fn().mockRejectedValue(new Error("only a family member can decide an executor verification")),
    });
    const service = new ExecutorVerificationService(repository);

    await expect(service.decide("estate-1", "member-1", true)).rejects.toThrow(ExecutorVerificationForbiddenError);
  });
});
