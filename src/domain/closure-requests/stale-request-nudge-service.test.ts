import { describe, expect, it, vi } from "vitest";
import type { DigitalAsset, DigitalAssetRepository } from "@/domain/assets/ports";
import type { Estate, EstateRepository } from "@/domain/estates/ports";
import type { EstateMember, MembershipRepository } from "@/domain/membership/ports";
import type { EmailSender } from "@/domain/notifications/ports";
import type { ClosureRequestRepository, StaleClosureRequest } from "./ports";
import { StaleClosureRequestNudgeService } from "./stale-request-nudge-service";

function makeStaleRequest(overrides: Partial<StaleClosureRequest> = {}): StaleClosureRequest {
  return {
    id: "request-1",
    estateId: "estate-1",
    digitalAssetId: "asset-1",
    assignedToUserId: null,
    status: "submitted",
    lastStatusChangeAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
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
    lastCheckInAt: new Date().toISOString(),
    gracePeriodDays: 14,
    verificationStartedAt: null,
    selfCancelWindowDays: 7,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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

function makeAsset(overrides: Partial<DigitalAsset> = {}): DigitalAsset {
  return {
    id: "asset-1",
    estateId: "estate-1",
    category: "financial",
    providerId: null,
    customProviderName: null,
    accountIdentifier: null,
    intendedOutcome: "close",
    intendedOutcomeNotes: null,
    estimatedValueCents: null,
    currency: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
    ...overrides,
  };
}

function makeMember(overrides: Partial<EstateMember> = {}): EstateMember {
  return {
    id: "member-1",
    estateId: "estate-1",
    userId: "user-executor",
    role: "executor",
    inviteEmail: "executor@example.com",
    inviteStatus: "accepted",
    invitedAt: new Date().toISOString(),
    acceptedAt: new Date().toISOString(),
    fallbackOrder: null,
    hasWrappedVaultKey: true,
    createdAt: new Date().toISOString(),
    inviteToken: null,
    ...overrides,
  };
}

function makeService(overrides: {
  closureRequestRepository?: Partial<ClosureRequestRepository>;
  estateRepository?: Partial<EstateRepository>;
  membershipRepository?: Partial<MembershipRepository>;
  assetRepository?: Partial<DigitalAssetRepository>;
  emailSender?: Partial<EmailSender>;
} = {}) {
  const closureRequestRepository = {
    markStaleRequestsNeedingNudge: vi.fn().mockResolvedValue([makeStaleRequest()]),
    ...overrides.closureRequestRepository,
  } as ClosureRequestRepository;

  const estateRepository = {
    getEstate: vi.fn().mockResolvedValue(makeEstate()),
    ...overrides.estateRepository,
  } as unknown as EstateRepository;

  const membershipRepository = {
    listMembers: vi.fn().mockResolvedValue([makeMember()]),
    ...overrides.membershipRepository,
  } as unknown as MembershipRepository;

  const assetRepository = {
    getAsset: vi.fn().mockResolvedValue(makeAsset()),
    ...overrides.assetRepository,
  } as unknown as DigitalAssetRepository;

  const emailSender = {
    sendClosureRequestStaleNudgeEmail: vi.fn().mockResolvedValue(true),
    ...overrides.emailSender,
  } as EmailSender;

  return new StaleClosureRequestNudgeService(
    closureRequestRepository,
    estateRepository,
    membershipRepository,
    assetRepository,
    emailSender,
  );
}

describe("StaleClosureRequestNudgeService.sendNudges", () => {
  it("passes the threshold through to the repository", async () => {
    const markStaleRequestsNeedingNudge = vi.fn().mockResolvedValue([]);
    const service = makeService({ closureRequestRepository: { markStaleRequestsNeedingNudge } });

    await service.sendNudges("https://app.example.com", 21);

    expect(markStaleRequestsNeedingNudge).toHaveBeenCalledWith(21);
  });

  it("defaults to a 14-day threshold", async () => {
    const markStaleRequestsNeedingNudge = vi.fn().mockResolvedValue([]);
    const service = makeService({ closureRequestRepository: { markStaleRequestsNeedingNudge } });

    await service.sendNudges("https://app.example.com");

    expect(markStaleRequestsNeedingNudge).toHaveBeenCalledWith(14);
  });

  it("emails the assigned executor when assignedToUserId matches an accepted executor", async () => {
    const sendClosureRequestStaleNudgeEmail = vi.fn().mockResolvedValue(true);
    const service = makeService({
      closureRequestRepository: {
        markStaleRequestsNeedingNudge: vi.fn().mockResolvedValue([makeStaleRequest({ assignedToUserId: "user-executor" })]),
      },
      membershipRepository: {
        listMembers: vi.fn().mockResolvedValue([
          makeMember({ userId: "user-executor", inviteEmail: "assigned@example.com" }),
          makeMember({ id: "member-2", userId: "user-other-executor", inviteEmail: "other@example.com" }),
        ]),
      },
      emailSender: { sendClosureRequestStaleNudgeEmail },
    });

    const result = await service.sendNudges("https://app.example.com");

    expect(sendClosureRequestStaleNudgeEmail).toHaveBeenCalledTimes(1);
    expect(sendClosureRequestStaleNudgeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: "assigned@example.com" }),
    );
    expect(result).toEqual({ staleRequestCount: 1, emailsSent: 1 });
  });

  it("falls back to every accepted executor when there is no assignee", async () => {
    const sendClosureRequestStaleNudgeEmail = vi.fn().mockResolvedValue(true);
    const service = makeService({
      membershipRepository: {
        listMembers: vi.fn().mockResolvedValue([
          makeMember({ userId: "user-executor", inviteEmail: "one@example.com" }),
          makeMember({ id: "member-2", userId: "user-other-executor", inviteEmail: "two@example.com" }),
          makeMember({ id: "member-3", role: "family", inviteEmail: "family@example.com", userId: "user-family" }),
        ]),
      },
      emailSender: { sendClosureRequestStaleNudgeEmail },
    });

    await service.sendNudges("https://app.example.com");

    expect(sendClosureRequestStaleNudgeEmail).toHaveBeenCalledTimes(2);
    const recipients = sendClosureRequestStaleNudgeEmail.mock.calls.map((call) => call[0].toEmail);
    expect(recipients).toEqual(["one@example.com", "two@example.com"]);
  });

  it("falls back to every accepted executor when the assignee is no longer an accepted executor", async () => {
    const sendClosureRequestStaleNudgeEmail = vi.fn().mockResolvedValue(true);
    const service = makeService({
      closureRequestRepository: {
        markStaleRequestsNeedingNudge: vi.fn().mockResolvedValue([makeStaleRequest({ assignedToUserId: "revoked-user" })]),
      },
      membershipRepository: {
        listMembers: vi.fn().mockResolvedValue([makeMember({ userId: "user-executor", inviteEmail: "fallback@example.com" })]),
      },
      emailSender: { sendClosureRequestStaleNudgeEmail },
    });

    await service.sendNudges("https://app.example.com");

    expect(sendClosureRequestStaleNudgeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: "fallback@example.com" }),
    );
  });

  it("builds an absolute closure-request URL and passes through asset/status context", async () => {
    const sendClosureRequestStaleNudgeEmail = vi.fn().mockResolvedValue(true);
    const service = makeService({
      closureRequestRepository: {
        markStaleRequestsNeedingNudge: vi
          .fn()
          .mockResolvedValue([makeStaleRequest({ estateId: "estate-9", digitalAssetId: "asset-9", status: "in_progress" })]),
      },
      estateRepository: { getEstate: vi.fn().mockResolvedValue(makeEstate({ id: "estate-9", displayName: "Marcus's Estate" })) },
      assetRepository: { getAsset: vi.fn().mockResolvedValue(makeAsset({ id: "asset-9", category: "subscription" })) },
      emailSender: { sendClosureRequestStaleNudgeEmail },
    });

    await service.sendNudges("https://app.example.com");

    expect(sendClosureRequestStaleNudgeEmail).toHaveBeenCalledWith({
      toEmail: "executor@example.com",
      estateDisplayName: "Marcus's Estate",
      assetCategory: "subscription",
      status: "in_progress",
      daysSinceLastStatusChange: expect.any(Number),
      closureRequestUrl: "https://app.example.com/estates/estate-9/assets/asset-9",
    });
  });

  it("skips a stale request whose estate or asset can no longer be found", async () => {
    const sendClosureRequestStaleNudgeEmail = vi.fn().mockResolvedValue(true);
    const service = makeService({
      estateRepository: { getEstate: vi.fn().mockResolvedValue(null) },
      emailSender: { sendClosureRequestStaleNudgeEmail },
    });

    const result = await service.sendNudges("https://app.example.com");

    expect(sendClosureRequestStaleNudgeEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ staleRequestCount: 1, emailsSent: 0 });
  });

  it("counts emailsSent only for sends that actually succeed", async () => {
    const sendClosureRequestStaleNudgeEmail = vi.fn().mockResolvedValue(false);
    const service = makeService({
      membershipRepository: {
        listMembers: vi.fn().mockResolvedValue([
          makeMember({ userId: "user-executor", inviteEmail: "one@example.com" }),
          makeMember({ id: "member-2", userId: "user-other-executor", inviteEmail: "two@example.com" }),
        ]),
      },
      emailSender: { sendClosureRequestStaleNudgeEmail },
    });

    const result = await service.sendNudges("https://app.example.com");

    expect(result).toEqual({ staleRequestCount: 1, emailsSent: 0 });
  });

  it("reports zero when there is nothing stale", async () => {
    const service = makeService({
      closureRequestRepository: { markStaleRequestsNeedingNudge: vi.fn().mockResolvedValue([]) },
    });

    const result = await service.sendNudges("https://app.example.com");

    expect(result).toEqual({ staleRequestCount: 0, emailsSent: 0 });
  });
});
