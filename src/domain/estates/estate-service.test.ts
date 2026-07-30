import { describe, expect, it, vi } from "vitest";
import type { Estate, EstateRepository, Jurisdiction } from "./ports";
import {
  EstateNotFoundError,
  EstateService,
  InvalidEstateInputError,
  MAX_CHECK_IN_INTERVAL_DAYS,
  MAX_DECEASED_FULL_NAME_LENGTH,
  MAX_DECEASED_RELATIONSHIP_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_GRACE_PERIOD_DAYS,
  MIN_CHECK_IN_INTERVAL_DAYS,
  MIN_GRACE_PERIOD_DAYS,
} from "./estate-service";

function createFakeRepository(overrides: Partial<EstateRepository> = {}): EstateRepository {
  return {
    createEstate: vi.fn(),
    getEstate: vi.fn(),
    updateEstate: vi.fn(),
    recordCheckIn: vi.fn(),
    listMyEstates: vi.fn(),
    listSupportedJurisdictions: vi.fn(),
    createDraftCase: vi.fn(),
    saveDraftProgress: vi.fn(),
    activateDraftCase: vi.fn(),
    ...overrides,
  };
}

function makeEstate(overrides: Partial<Estate> = {}): Estate {
  return {
    id: "estate-1",
    ownerUserId: "user-1",
    jurisdictionId: "jurisdiction-1",
    displayName: "Diane's Estate",
    status: "setup",
    checkInIntervalDays: 90,
    lastCheckInAt: "2026-07-19T00:00:00.000Z",
    gracePeriodDays: 14,
    verificationStartedAt: null,
    selfCancelWindowDays: 7,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    closedAt: null,
    deceasedFullName: null,
    deceasedDateOfBirth: null,
    deceasedRelationship: null,
    deceasedDateOfDeath: null,
    draftStep: null,
    draftPayload: {},
    ...overrides,
  };
}

describe("EstateService.createEstate", () => {
  it("delegates to the repository with a trimmed display name", async () => {
    const estate = makeEstate();
    const repository = createFakeRepository({ createEstate: vi.fn().mockResolvedValue(estate) });
    const service = new EstateService(repository);

    const result = await service.createEstate({
      displayName: "  Diane's Estate  ",
      jurisdictionId: "jurisdiction-1",
    });

    expect(repository.createEstate).toHaveBeenCalledWith({
      displayName: "Diane's Estate",
      jurisdictionId: "jurisdiction-1",
      checkInIntervalDays: undefined,
    });
    expect(result).toBe(estate);
  });

  it("rejects an empty display name without calling the repository", async () => {
    const repository = createFakeRepository();
    const service = new EstateService(repository);

    await expect(
      service.createEstate({ displayName: "   ", jurisdictionId: "jurisdiction-1" }),
    ).rejects.toThrow(InvalidEstateInputError);
    expect(repository.createEstate).not.toHaveBeenCalled();
  });

  it(`rejects a display name longer than ${MAX_DISPLAY_NAME_LENGTH} characters`, async () => {
    const repository = createFakeRepository();
    const service = new EstateService(repository);

    await expect(
      service.createEstate({
        displayName: "x".repeat(MAX_DISPLAY_NAME_LENGTH + 1),
        jurisdictionId: "jurisdiction-1",
      }),
    ).rejects.toThrow(InvalidEstateInputError);
  });

  it("rejects a missing jurisdiction", async () => {
    const repository = createFakeRepository();
    const service = new EstateService(repository);

    await expect(
      service.createEstate({ displayName: "Diane's Estate", jurisdictionId: "  " }),
    ).rejects.toThrow(InvalidEstateInputError);
  });

  it.each([MIN_CHECK_IN_INTERVAL_DAYS - 1, MAX_CHECK_IN_INTERVAL_DAYS + 1, 45.5])(
    "rejects an out-of-bounds/non-integer check-in interval (%s)",
    async (days) => {
      const repository = createFakeRepository();
      const service = new EstateService(repository);

      await expect(
        service.createEstate({
          displayName: "Diane's Estate",
          jurisdictionId: "jurisdiction-1",
          checkInIntervalDays: days,
        }),
      ).rejects.toThrow(InvalidEstateInputError);
    },
  );

  it.each([MIN_CHECK_IN_INTERVAL_DAYS, MAX_CHECK_IN_INTERVAL_DAYS])(
    "accepts a boundary check-in interval (%s)",
    async (days) => {
      const estate = makeEstate({ checkInIntervalDays: days });
      const repository = createFakeRepository({ createEstate: vi.fn().mockResolvedValue(estate) });
      const service = new EstateService(repository);

      await expect(
        service.createEstate({
          displayName: "Diane's Estate",
          jurisdictionId: "jurisdiction-1",
          checkInIntervalDays: days,
        }),
      ).resolves.toBe(estate);
    },
  );
});

describe("EstateService.getEstate", () => {
  it("returns the estate when the repository finds it", async () => {
    const estate = makeEstate();
    const repository = createFakeRepository({ getEstate: vi.fn().mockResolvedValue(estate) });
    const service = new EstateService(repository);

    await expect(service.getEstate("estate-1")).resolves.toBe(estate);
  });

  it("throws EstateNotFoundError when the repository returns null", async () => {
    const repository = createFakeRepository({ getEstate: vi.fn().mockResolvedValue(null) });
    const service = new EstateService(repository);

    await expect(service.getEstate("nonexistent")).rejects.toThrow(EstateNotFoundError);
  });
});

describe("EstateService.updateEstate", () => {
  it("only forwards fields that were provided", async () => {
    const estate = makeEstate({ displayName: "New Name" });
    const repository = createFakeRepository({ updateEstate: vi.fn().mockResolvedValue(estate) });
    const service = new EstateService(repository);

    await service.updateEstate("estate-1", { displayName: "New Name" });

    expect(repository.updateEstate).toHaveBeenCalledWith("estate-1", { displayName: "New Name" });
  });

  it("throws when no fields are provided", async () => {
    const repository = createFakeRepository();
    const service = new EstateService(repository);

    await expect(service.updateEstate("estate-1", {})).rejects.toThrow(InvalidEstateInputError);
    expect(repository.updateEstate).not.toHaveBeenCalled();
  });

  it.each([MIN_GRACE_PERIOD_DAYS - 1, MAX_GRACE_PERIOD_DAYS + 1])(
    "rejects an out-of-bounds grace period (%s)",
    async (days) => {
      const repository = createFakeRepository();
      const service = new EstateService(repository);

      await expect(
        service.updateEstate("estate-1", { gracePeriodDays: days }),
      ).rejects.toThrow(InvalidEstateInputError);
    },
  );

  it("rejects an empty display name on update, same as creation", async () => {
    const repository = createFakeRepository();
    const service = new EstateService(repository);

    await expect(
      service.updateEstate("estate-1", { displayName: "   " }),
    ).rejects.toThrow(InvalidEstateInputError);
  });
});

describe("EstateService.checkIn", () => {
  it.each(["setup", "active_living"] as const)("allows check-in while status is %s", async (status) => {
    const estate = makeEstate({ status });
    const repository = createFakeRepository({
      getEstate: vi.fn().mockResolvedValue(estate),
      recordCheckIn: vi.fn().mockResolvedValue(estate),
    });
    const service = new EstateService(repository);

    await expect(service.checkIn("estate-1")).resolves.toBe(estate);
    expect(repository.recordCheckIn).toHaveBeenCalledWith("estate-1");
  });

  it.each([
    "checkin_overdue",
    "death_reported",
    "verifying",
    "awaiting_death_certificate",
    "active_executor",
    "closed",
  ] as const)("rejects check-in while status is %s", async (status) => {
    const estate = makeEstate({ status });
    const repository = createFakeRepository({
      getEstate: vi.fn().mockResolvedValue(estate),
      recordCheckIn: vi.fn(),
    });
    const service = new EstateService(repository);

    await expect(service.checkIn("estate-1")).rejects.toThrow(InvalidEstateInputError);
    expect(repository.recordCheckIn).not.toHaveBeenCalled();
  });
});

describe("EstateService.listMyEstates / listSupportedJurisdictions", () => {
  it("listMyEstates delegates directly to the repository", async () => {
    const estates = [makeEstate()];
    const repository = createFakeRepository({ listMyEstates: vi.fn().mockResolvedValue(estates) });
    const service = new EstateService(repository);

    await expect(service.listMyEstates()).resolves.toBe(estates);
  });

  it("listSupportedJurisdictions delegates directly to the repository", async () => {
    const jurisdictions: Jurisdiction[] = [
      { id: "j1", countryCode: "US", regionCode: "CA", displayName: "California, United States" },
    ];
    const repository = createFakeRepository({
      listSupportedJurisdictions: vi.fn().mockResolvedValue(jurisdictions),
    });
    const service = new EstateService(repository);

    await expect(service.listSupportedJurisdictions()).resolves.toBe(jurisdictions);
  });
});

describe("EstateService.createDraftCase", () => {
  const validInput = {
    jurisdictionId: "jurisdiction-1",
    deceasedFullName: "Diane Whitfield",
    deceasedDateOfBirth: "1950-01-01",
    deceasedRelationship: "mother",
  };

  it("delegates to the repository with trimmed fields, deceasedDateOfDeath defaulting to null", async () => {
    const estate = makeEstate({ status: "draft" });
    const repository = createFakeRepository({ createDraftCase: vi.fn().mockResolvedValue(estate) });
    const service = new EstateService(repository);

    const result = await service.createDraftCase({
      ...validInput,
      deceasedFullName: "  Diane Whitfield  ",
    });

    expect(repository.createDraftCase).toHaveBeenCalledWith({
      jurisdictionId: "jurisdiction-1",
      deceasedFullName: "Diane Whitfield",
      deceasedDateOfBirth: "1950-01-01",
      deceasedRelationship: "mother",
      deceasedDateOfDeath: null,
      checkInIntervalDays: undefined,
    });
    expect(result).toBe(estate);
  });

  it("passes through a provided deceasedDateOfDeath", async () => {
    const estate = makeEstate({ status: "draft" });
    const repository = createFakeRepository({ createDraftCase: vi.fn().mockResolvedValue(estate) });
    const service = new EstateService(repository);

    await service.createDraftCase({ ...validInput, deceasedDateOfDeath: "2026-07-01" });

    expect(repository.createDraftCase).toHaveBeenCalledWith(
      expect.objectContaining({ deceasedDateOfDeath: "2026-07-01" }),
    );
  });

  it("rejects a missing jurisdiction", async () => {
    const repository = createFakeRepository();
    const service = new EstateService(repository);

    await expect(
      service.createDraftCase({ ...validInput, jurisdictionId: "  " }),
    ).rejects.toThrow(InvalidEstateInputError);
    expect(repository.createDraftCase).not.toHaveBeenCalled();
  });

  it("rejects a blank deceased full name", async () => {
    const repository = createFakeRepository();
    const service = new EstateService(repository);

    await expect(
      service.createDraftCase({ ...validInput, deceasedFullName: "   " }),
    ).rejects.toThrow(InvalidEstateInputError);
  });

  it(`rejects a deceased full name longer than ${MAX_DECEASED_FULL_NAME_LENGTH} characters`, async () => {
    const repository = createFakeRepository();
    const service = new EstateService(repository);

    await expect(
      service.createDraftCase({ ...validInput, deceasedFullName: "x".repeat(MAX_DECEASED_FULL_NAME_LENGTH + 1) }),
    ).rejects.toThrow(InvalidEstateInputError);
  });

  it(`rejects a relationship longer than ${MAX_DECEASED_RELATIONSHIP_LENGTH} characters`, async () => {
    const repository = createFakeRepository();
    const service = new EstateService(repository);

    await expect(
      service.createDraftCase({
        ...validInput,
        deceasedRelationship: "x".repeat(MAX_DECEASED_RELATIONSHIP_LENGTH + 1),
      }),
    ).rejects.toThrow(InvalidEstateInputError);
  });

  it("rejects a malformed date of birth", async () => {
    const repository = createFakeRepository();
    const service = new EstateService(repository);

    await expect(
      service.createDraftCase({ ...validInput, deceasedDateOfBirth: "not-a-date" }),
    ).rejects.toThrow(InvalidEstateInputError);
  });

  it("rejects a date of birth in the future", async () => {
    const repository = createFakeRepository();
    const service = new EstateService(repository);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await expect(
      service.createDraftCase({ ...validInput, deceasedDateOfBirth: future }),
    ).rejects.toThrow(InvalidEstateInputError);
  });

  it("rejects a date of death before the date of birth", async () => {
    const repository = createFakeRepository();
    const service = new EstateService(repository);

    await expect(
      service.createDraftCase({
        ...validInput,
        deceasedDateOfBirth: "2000-01-01",
        deceasedDateOfDeath: "1999-01-01",
      }),
    ).rejects.toThrow(InvalidEstateInputError);
  });
});

describe("EstateService.saveDraftProgress", () => {
  it("merges the given payload into the existing draft_payload rather than replacing it", async () => {
    const existing = makeEstate({ status: "draft", draftPayload: { step1: "answer1" } });
    const updated = makeEstate({ status: "draft", draftPayload: { step1: "answer1", step2: "answer2" } });
    const repository = createFakeRepository({
      getEstate: vi.fn().mockResolvedValue(existing),
      saveDraftProgress: vi.fn().mockResolvedValue(updated),
    });
    const service = new EstateService(repository);

    const result = await service.saveDraftProgress("estate-1", {
      draftStep: "step2",
      draftPayload: { step2: "answer2" },
    });

    expect(repository.saveDraftProgress).toHaveBeenCalledWith("estate-1", {
      draftStep: "step2",
      draftPayload: { step1: "answer1", step2: "answer2" },
    });
    expect(result).toBe(updated);
  });

  it("rejects saving progress once onboarding is no longer in draft", async () => {
    const existing = makeEstate({ status: "active_living" });
    const repository = createFakeRepository({ getEstate: vi.fn().mockResolvedValue(existing) });
    const service = new EstateService(repository);

    await expect(
      service.saveDraftProgress("estate-1", { draftStep: "step2", draftPayload: {} }),
    ).rejects.toThrow(InvalidEstateInputError);
    expect(repository.saveDraftProgress).not.toHaveBeenCalled();
  });

  it("rejects a blank draftStep", async () => {
    const existing = makeEstate({ status: "draft" });
    const repository = createFakeRepository({ getEstate: vi.fn().mockResolvedValue(existing) });
    const service = new EstateService(repository);

    await expect(
      service.saveDraftProgress("estate-1", { draftStep: "  ", draftPayload: {} }),
    ).rejects.toThrow(InvalidEstateInputError);
  });

  it("rejects a non-object draftPayload", async () => {
    const existing = makeEstate({ status: "draft" });
    const repository = createFakeRepository({ getEstate: vi.fn().mockResolvedValue(existing) });
    const service = new EstateService(repository);

    await expect(
      service.saveDraftProgress("estate-1", { draftStep: "step2", draftPayload: "not-an-object" as never }),
    ).rejects.toThrow(InvalidEstateInputError);
  });
});

describe("EstateService.activateDraftCase", () => {
  it("delegates to the repository when the case is in draft status", async () => {
    const existing = makeEstate({ status: "draft" });
    const activated = makeEstate({ status: "active_living" });
    const repository = createFakeRepository({
      getEstate: vi.fn().mockResolvedValue(existing),
      activateDraftCase: vi.fn().mockResolvedValue(activated),
    });
    const service = new EstateService(repository);

    await expect(service.activateDraftCase("estate-1")).resolves.toBe(activated);
    expect(repository.activateDraftCase).toHaveBeenCalledWith("estate-1");
  });

  it("rejects activating a case that isn't in draft status", async () => {
    const existing = makeEstate({ status: "active_living" });
    const repository = createFakeRepository({ getEstate: vi.fn().mockResolvedValue(existing) });
    const service = new EstateService(repository);

    await expect(service.activateDraftCase("estate-1")).rejects.toThrow(InvalidEstateInputError);
    expect(repository.activateDraftCase).not.toHaveBeenCalled();
  });
});
