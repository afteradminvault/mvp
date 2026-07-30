import { describe, expect, it, vi } from "vitest";
import type { Estate, EstateRepository } from "@/domain/estates/ports";
import type { Platform, PlatformRepository } from "@/domain/platforms/ports";
import type { Document, DocumentRepository } from "@/domain/documents/ports";
import type { EmailSender } from "@/domain/notifications/ports";
import type { NotificationLetter, NotificationLetterRepository } from "./ports";
import {
  InvalidNotificationLetterInputError,
  NotificationLetterAlreadyFinalizedError,
  NotificationLetterNotFoundError,
  NotificationLetterService,
} from "./notification-letter-service";

function makeEstate(overrides: Partial<Estate> = {}): Estate {
  return {
    id: "estate-1",
    ownerUserId: "user-1",
    jurisdictionId: "jurisdiction-1",
    displayName: "Diane Whitfield's Case",
    status: "active_living",
    checkInIntervalDays: 90,
    lastCheckInAt: "2026-08-03T00:00:00.000Z",
    gracePeriodDays: 14,
    verificationStartedAt: null,
    selfCancelWindowDays: 7,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    closedAt: null,
    deceasedFullName: "Diane Whitfield",
    deceasedDateOfBirth: "1950-01-01",
    deceasedRelationship: "mother",
    deceasedDateOfDeath: "2026-07-01",
    draftStep: null,
    draftPayload: {},
    isSelfPlanned: false,
    ...overrides,
  };
}

function makePlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    id: "provider-1",
    name: "Chase",
    defaultCategory: "financial",
    logoUrl: null,
    closureMethod: "online_form",
    closureInstructions: null,
    bereavementContactEmail: "bereavement@chase.example",
    bereavementContactPhone: null,
    bereavementInstructionsUrl: null,
    websiteUrl: null,
    supportsMemorialize: false,
    ...overrides,
  };
}

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    estateId: "estate-1",
    uploadedByUserId: "user-1",
    documentType: "notification_letter",
    storagePath: "estate-1/doc-1",
    fileName: "notification-letter-Chase.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 100,
    isCertifiedOriginal: false,
    notes: null,
    uploadedAt: "2026-08-03T00:00:00.000Z",
    ...overrides,
  };
}

function makeLetter(overrides: Partial<NotificationLetter> = {}): NotificationLetter {
  return {
    id: "letter-1",
    estateId: "estate-1",
    platformId: "provider-1",
    createdByUserId: "user-1",
    letterType: "close",
    content: "To Whom It May Concern...",
    sentVia: null,
    sentAt: null,
    pdfDocumentId: null,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    ...overrides,
  };
}

function makeService(
  overrides: {
    letterRepository?: Partial<NotificationLetterRepository>;
    estateRepository?: Partial<EstateRepository>;
    platformRepository?: Partial<PlatformRepository>;
    documentRepository?: Partial<DocumentRepository>;
    emailSender?: Partial<EmailSender>;
  } = {},
) {
  const letterRepository = {
    createLetter: vi.fn().mockResolvedValue(makeLetter()),
    getLetter: vi.fn().mockResolvedValue(makeLetter()),
    listLetters: vi.fn(),
    updateContent: vi.fn(),
    finalize: vi.fn(),
    getUserDisplayName: vi.fn().mockResolvedValue("Marcus Whitfield"),
    ...overrides.letterRepository,
  } as NotificationLetterRepository;

  const estateRepository = {
    getEstate: vi.fn().mockResolvedValue(makeEstate()),
    ...overrides.estateRepository,
  } as unknown as EstateRepository;

  const platformRepository = {
    getPlatform: vi.fn().mockResolvedValue(makePlatform()),
    ...overrides.platformRepository,
  } as unknown as PlatformRepository;

  const documentRepository = {
    uploadDocument: vi.fn().mockResolvedValue(makeDocument()),
    createSignedDownloadUrl: vi.fn(),
    ...overrides.documentRepository,
  } as unknown as DocumentRepository;

  const emailSender = {
    sendNotificationLetterEmail: vi.fn().mockResolvedValue(true),
    ...overrides.emailSender,
  } as EmailSender;

  return {
    service: new NotificationLetterService(letterRepository, estateRepository, platformRepository, documentRepository, emailSender),
    letterRepository,
    estateRepository,
    platformRepository,
    documentRepository,
    emailSender,
  };
}

describe("NotificationLetterService.generateLetter", () => {
  it("auto-fills from the deceased profile and platform, and persists the composed content", async () => {
    const { service, letterRepository } = makeService();

    await service.generateLetter("estate-1", "user-1", { platformId: "provider-1", letterType: "close" });

    const call = (letterRepository.createLetter as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("estate-1");
    expect(call[1]).toBe("user-1");
    expect(call[2].platformId).toBe("provider-1");
    expect(call[2].letterType).toBe("close");
    expect(call[2].content).toContain("Diane Whitfield");
    expect(call[2].content).toContain("Marcus Whitfield");
    expect(call[2].content).toContain("Chase");
  });

  it("rejects memorialize when the platform doesn't support it", async () => {
    const { service } = makeService({
      platformRepository: { getPlatform: vi.fn().mockResolvedValue(makePlatform({ supportsMemorialize: false })) },
    });

    await expect(
      service.generateLetter("estate-1", "user-1", { platformId: "provider-1", letterType: "memorialize" }),
    ).rejects.toThrow(InvalidNotificationLetterInputError);
  });

  it("accepts memorialize when the platform supports it", async () => {
    const { service, letterRepository } = makeService({
      platformRepository: { getPlatform: vi.fn().mockResolvedValue(makePlatform({ supportsMemorialize: true })) },
    });

    await service.generateLetter("estate-1", "user-1", { platformId: "provider-1", letterType: "memorialize" });

    expect(letterRepository.createLetter).toHaveBeenCalled();
  });

  it("rejects generating a letter when the case has no deceased profile on file", async () => {
    const { service } = makeService({
      estateRepository: { getEstate: vi.fn().mockResolvedValue(makeEstate({ deceasedFullName: null })) },
    });

    await expect(
      service.generateLetter("estate-1", "user-1", { platformId: "provider-1", letterType: "close" }),
    ).rejects.toThrow(InvalidNotificationLetterInputError);
  });

  it("rejects an unknown platform", async () => {
    const { service } = makeService({ platformRepository: { getPlatform: vi.fn().mockResolvedValue(null) } });

    await expect(
      service.generateLetter("estate-1", "user-1", { platformId: "provider-1", letterType: "close" }),
    ).rejects.toThrow(InvalidNotificationLetterInputError);
  });
});

describe("NotificationLetterService.updateContent", () => {
  it("updates content before finalization", async () => {
    const { service, letterRepository } = makeService({
      letterRepository: { getLetter: vi.fn().mockResolvedValue(makeLetter({ sentAt: null })) },
    });

    await service.updateContent("letter-1", "Edited content");

    expect(letterRepository.updateContent).toHaveBeenCalledWith("letter-1", "Edited content");
  });

  it("refuses to edit an already-finalized letter", async () => {
    const { service } = makeService({
      letterRepository: {
        getLetter: vi.fn().mockResolvedValue(makeLetter({ sentAt: "2026-08-03T01:00:00.000Z", sentVia: "email" })),
      },
    });

    await expect(service.updateContent("letter-1", "Edited content")).rejects.toThrow(
      NotificationLetterAlreadyFinalizedError,
    );
  });

  it("rejects blank content", async () => {
    const { service } = makeService();

    await expect(service.updateContent("letter-1", "   ")).rejects.toThrow(InvalidNotificationLetterInputError);
  });
});

describe("NotificationLetterService.finalize", () => {
  it("generates and stores a PDF, then finalizes with sentVia=download", async () => {
    const { service, documentRepository, letterRepository, emailSender } = makeService();

    await service.finalize("estate-1", "letter-1", "user-1", "download");

    expect(documentRepository.uploadDocument).toHaveBeenCalledWith(
      "estate-1",
      "user-1",
      expect.objectContaining({ documentType: "notification_letter", mimeType: "application/pdf" }),
    );
    expect(letterRepository.finalize).toHaveBeenCalledWith("letter-1", { sentVia: "download", pdfDocumentId: "doc-1" });
    expect(emailSender.sendNotificationLetterEmail).not.toHaveBeenCalled();
  });

  it("sends via email when sentVia=email and a bereavement contact email is on file", async () => {
    const { service, emailSender } = makeService();

    await service.finalize("estate-1", "letter-1", "user-1", "email");

    expect(emailSender.sendNotificationLetterEmail).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: "bereavement@chase.example" }),
    );
  });

  it("rejects sentVia=email when the platform has no bereavement contact email", async () => {
    const { service } = makeService({
      platformRepository: { getPlatform: vi.fn().mockResolvedValue(makePlatform({ bereavementContactEmail: null })) },
    });

    await expect(service.finalize("estate-1", "letter-1", "user-1", "email")).rejects.toThrow(
      InvalidNotificationLetterInputError,
    );
  });

  it("still finalizes even when the email send fails (best-effort)", async () => {
    const { service, letterRepository } = makeService({
      emailSender: { sendNotificationLetterEmail: vi.fn().mockResolvedValue(false) },
    });

    await service.finalize("estate-1", "letter-1", "user-1", "email");

    expect(letterRepository.finalize).toHaveBeenCalledWith("letter-1", { sentVia: "email", pdfDocumentId: "doc-1" });
  });

  it("refuses to finalize an already-finalized letter", async () => {
    const { service } = makeService({
      letterRepository: {
        getLetter: vi.fn().mockResolvedValue(makeLetter({ sentAt: "2026-08-03T01:00:00.000Z", sentVia: "copy" })),
      },
    });

    await expect(service.finalize("estate-1", "letter-1", "user-1", "download")).rejects.toThrow(
      NotificationLetterAlreadyFinalizedError,
    );
  });

  it("rejects an invalid sentVia", async () => {
    const { service } = makeService();

    await expect(service.finalize("estate-1", "letter-1", "user-1", "fax")).rejects.toThrow(
      InvalidNotificationLetterInputError,
    );
  });
});

describe("NotificationLetterService.getLetter / listLetters", () => {
  it("throws NotificationLetterNotFoundError when not found", async () => {
    const { service } = makeService({ letterRepository: { getLetter: vi.fn().mockResolvedValue(null) } });

    await expect(service.getLetter("nonexistent")).rejects.toThrow(NotificationLetterNotFoundError);
  });

  it("listLetters delegates to the repository", async () => {
    const letters = [makeLetter()];
    const { service } = makeService({ letterRepository: { listLetters: vi.fn().mockResolvedValue(letters) } });

    await expect(service.listLetters("estate-1")).resolves.toBe(letters);
  });
});
