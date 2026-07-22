import { describe, expect, it, vi } from "vitest";
import type { AdminJurisdiction, AdminJurisdictionRepository } from "./ports";
import {
  AdminJurisdictionService,
  InvalidJurisdictionInputError,
  JurisdictionForbiddenError,
  MAX_DISPLAY_NAME_LENGTH,
} from "./admin-jurisdiction-service";

function createFakeRepository(overrides: Partial<AdminJurisdictionRepository> = {}): AdminJurisdictionRepository {
  return {
    createJurisdiction: vi.fn(),
    listJurisdictions: vi.fn(),
    updateJurisdiction: vi.fn(),
    ...overrides,
  };
}

function makeJurisdiction(overrides: Partial<AdminJurisdiction> = {}): AdminJurisdiction {
  return {
    id: "jurisdiction-1",
    countryCode: "US",
    regionCode: "CA",
    displayName: "California, United States",
    isSupported: true,
    ...overrides,
  };
}

describe("AdminJurisdictionService.createJurisdiction", () => {
  it("creates a jurisdiction, defaulting isSupported to false", async () => {
    const jurisdiction = makeJurisdiction({ isSupported: false });
    const repository = createFakeRepository({ createJurisdiction: vi.fn().mockResolvedValue(jurisdiction) });
    const service = new AdminJurisdictionService(repository);

    await service.createJurisdiction({ countryCode: "US", regionCode: "CA", displayName: "California, United States" });

    expect(repository.createJurisdiction).toHaveBeenCalledWith({
      countryCode: "US",
      regionCode: "CA",
      displayName: "California, United States",
      isSupported: false,
    });
  });

  it("rejects an invalid country code", async () => {
    const repository = createFakeRepository();
    const service = new AdminJurisdictionService(repository);

    await expect(
      service.createJurisdiction({ countryCode: "USA", displayName: "United States" }),
    ).rejects.toThrow(InvalidJurisdictionInputError);
  });

  it("rejects a blank display name", async () => {
    const repository = createFakeRepository();
    const service = new AdminJurisdictionService(repository);

    await expect(service.createJurisdiction({ countryCode: "US", displayName: "   " })).rejects.toThrow(
      InvalidJurisdictionInputError,
    );
  });

  it(`rejects a display name longer than ${MAX_DISPLAY_NAME_LENGTH} characters`, async () => {
    const repository = createFakeRepository();
    const service = new AdminJurisdictionService(repository);

    await expect(
      service.createJurisdiction({ countryCode: "US", displayName: "x".repeat(MAX_DISPLAY_NAME_LENGTH + 1) }),
    ).rejects.toThrow(InvalidJurisdictionInputError);
  });

  it("normalizes an empty-string regionCode to null (country-level row)", async () => {
    const jurisdiction = makeJurisdiction({ regionCode: null });
    const repository = createFakeRepository({ createJurisdiction: vi.fn().mockResolvedValue(jurisdiction) });
    const service = new AdminJurisdictionService(repository);

    await service.createJurisdiction({ countryCode: "US", regionCode: "  ", displayName: "United States" });

    expect(repository.createJurisdiction).toHaveBeenCalledWith(
      expect.objectContaining({ regionCode: null }),
    );
  });

  it("translates a repository forbidden error", async () => {
    const repository = createFakeRepository({
      createJurisdiction: vi.fn().mockRejectedValue(new Error("new row violates row-level security policy")),
    });
    const service = new AdminJurisdictionService(repository);

    await expect(
      service.createJurisdiction({ countryCode: "US", displayName: "United States" }),
    ).rejects.toThrow(JurisdictionForbiddenError);
  });
});

describe("AdminJurisdictionService.listJurisdictions", () => {
  it("delegates to the repository", async () => {
    const jurisdictions = [makeJurisdiction()];
    const repository = createFakeRepository({ listJurisdictions: vi.fn().mockResolvedValue(jurisdictions) });
    const service = new AdminJurisdictionService(repository);

    await expect(service.listJurisdictions()).resolves.toBe(jurisdictions);
  });
});

describe("AdminJurisdictionService.updateJurisdiction", () => {
  it("only forwards fields that were provided", async () => {
    const jurisdiction = makeJurisdiction({ isSupported: true });
    const repository = createFakeRepository({ updateJurisdiction: vi.fn().mockResolvedValue(jurisdiction) });
    const service = new AdminJurisdictionService(repository);

    await service.updateJurisdiction("jurisdiction-1", { isSupported: true });

    expect(repository.updateJurisdiction).toHaveBeenCalledWith("jurisdiction-1", { isSupported: true });
  });

  it("throws when no fields are provided", async () => {
    const repository = createFakeRepository();
    const service = new AdminJurisdictionService(repository);

    await expect(service.updateJurisdiction("jurisdiction-1", {})).rejects.toThrow(InvalidJurisdictionInputError);
    expect(repository.updateJurisdiction).not.toHaveBeenCalled();
  });
});
