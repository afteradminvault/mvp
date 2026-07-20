import { describe, expect, it, vi } from "vitest";
import type { Estate, EstateRepository, Jurisdiction } from "./ports";
import {
  EstateNotFoundError,
  EstateService,
  InvalidEstateInputError,
  MAX_CHECK_IN_INTERVAL_DAYS,
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
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    closedAt: null,
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
