import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Estate, EstateRepository } from "@/domain/estates/ports";
import { EstateNotFoundError } from "@/domain/estates/estate-service";
import type { ExecutorKeyRecoveryMaterial, KeyRecoveryRepository } from "./ports";
import { KeyRecoveryForbiddenError, KeyRecoveryNotAvailableError, KeyRecoveryService } from "./key-recovery-service";

function makeEstate(overrides: Partial<Estate> = {}): Estate {
  return {
    id: "estate-1",
    ownerUserId: "owner-1",
    jurisdictionId: "jurisdiction-1",
    displayName: "Diane's Estate",
    status: "active_executor",
    checkInIntervalDays: 90,
    lastCheckInAt: "2026-07-25T00:00:00.000Z",
    gracePeriodDays: 14,
    verificationStartedAt: null,
    selfCancelWindowDays: 7,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    closedAt: null,
    ...overrides,
  };
}

function makeMaterial(overrides: Partial<ExecutorKeyRecoveryMaterial> = {}): ExecutorKeyRecoveryMaterial {
  return {
    wrappedVaultKey: "aabb",
    publicKey: "ccdd",
    wrappedPrivateKey: "eeff",
    kdfSalt: "0011",
    ...overrides,
  };
}

function createFakeEstateRepository(overrides: Partial<EstateRepository> = {}): EstateRepository {
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

function createFakeKeyRecoveryRepository(overrides: Partial<KeyRecoveryRepository> = {}): KeyRecoveryRepository {
  return {
    getExecutorKeyRecoveryMaterial: vi.fn(),
    ...overrides,
  };
}

describe("KeyRecoveryService", () => {
  let estateRepository: EstateRepository;
  let keyRecoveryRepository: KeyRecoveryRepository;

  beforeEach(() => {
    estateRepository = createFakeEstateRepository({ getEstate: vi.fn().mockResolvedValue(makeEstate()) });
    keyRecoveryRepository = createFakeKeyRecoveryRepository({
      getExecutorKeyRecoveryMaterial: vi.fn().mockResolvedValue(makeMaterial()),
    });
  });

  it("throws EstateNotFoundError when the estate doesn't exist", async () => {
    estateRepository.getEstate = vi.fn().mockResolvedValue(null);
    const service = new KeyRecoveryService(estateRepository, keyRecoveryRepository);

    await expect(service.getExecutorKeyRecoveryMaterial("estate-1", "user-1")).rejects.toThrow(EstateNotFoundError);
    expect(keyRecoveryRepository.getExecutorKeyRecoveryMaterial).not.toHaveBeenCalled();
  });

  it("throws KeyRecoveryNotAvailableError when the estate isn't active_executor yet, without querying wrapped material", async () => {
    estateRepository.getEstate = vi.fn().mockResolvedValue(makeEstate({ status: "verifying" }));
    const service = new KeyRecoveryService(estateRepository, keyRecoveryRepository);

    await expect(service.getExecutorKeyRecoveryMaterial("estate-1", "user-1")).rejects.toThrow(
      KeyRecoveryNotAvailableError,
    );
    expect(keyRecoveryRepository.getExecutorKeyRecoveryMaterial).not.toHaveBeenCalled();
  });

  it("throws KeyRecoveryForbiddenError when the repository has no material for this caller", async () => {
    keyRecoveryRepository.getExecutorKeyRecoveryMaterial = vi.fn().mockResolvedValue(null);
    const service = new KeyRecoveryService(estateRepository, keyRecoveryRepository);

    await expect(service.getExecutorKeyRecoveryMaterial("estate-1", "user-1")).rejects.toThrow(
      KeyRecoveryForbiddenError,
    );
  });

  it("returns the wrapped material once active_executor and material exists", async () => {
    const service = new KeyRecoveryService(estateRepository, keyRecoveryRepository);
    const material = await service.getExecutorKeyRecoveryMaterial("estate-1", "user-1");
    expect(material).toEqual(makeMaterial());
  });
});
