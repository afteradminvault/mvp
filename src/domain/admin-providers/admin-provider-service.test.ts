import { describe, expect, it, vi } from "vitest";
import type { AdminProvider, AdminProviderRepository } from "./ports";
import {
  AdminProviderService,
  InvalidProviderInputError,
  MAX_CLOSURE_INSTRUCTIONS_LENGTH,
  MAX_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  ProviderForbiddenError,
} from "./admin-provider-service";

function createFakeRepository(overrides: Partial<AdminProviderRepository> = {}): AdminProviderRepository {
  return {
    createProvider: vi.fn(),
    listProviders: vi.fn(),
    updateProvider: vi.fn(),
    ...overrides,
  };
}

function makeProvider(overrides: Partial<AdminProvider> = {}): AdminProvider {
  return {
    id: "provider-1",
    name: "Chase",
    defaultCategory: "financial",
    websiteUrl: null,
    notes: null,
    closureMethod: null,
    closureInstructions: null,
    bereavementContactEmail: null,
    bereavementContactPhone: null,
    bereavementInstructionsUrl: null,
    logoUrl: null,
    isCommonOnboardingPlatform: false,
    supportsMemorialize: false,
    isActive: true,
    ...overrides,
  };
}

describe("AdminProviderService.createProvider", () => {
  it("creates a provider with valid input", async () => {
    const provider = makeProvider();
    const repository = createFakeRepository({ createProvider: vi.fn().mockResolvedValue(provider) });
    const service = new AdminProviderService(repository);

    const result = await service.createProvider({ name: "Chase", defaultCategory: "financial" });

    expect(repository.createProvider).toHaveBeenCalledWith({
      name: "Chase",
      defaultCategory: "financial",
      websiteUrl: null,
      notes: null,
      closureMethod: null,
      closureInstructions: null,
      bereavementContactEmail: null,
      bereavementContactPhone: null,
      bereavementInstructionsUrl: null,
      logoUrl: null,
      isCommonOnboardingPlatform: false,
      supportsMemorialize: false,
      isActive: true,
    });
    expect(result).toBe(provider);
  });

  it("rejects a blank name", async () => {
    const repository = createFakeRepository();
    const service = new AdminProviderService(repository);

    await expect(service.createProvider({ name: "   ", defaultCategory: "financial" })).rejects.toThrow(
      InvalidProviderInputError,
    );
  });

  it(`rejects a name longer than ${MAX_NAME_LENGTH} characters`, async () => {
    const repository = createFakeRepository();
    const service = new AdminProviderService(repository);

    await expect(
      service.createProvider({ name: "x".repeat(MAX_NAME_LENGTH + 1), defaultCategory: "financial" }),
    ).rejects.toThrow(InvalidProviderInputError);
  });

  it("rejects an invalid defaultCategory", async () => {
    const repository = createFakeRepository();
    const service = new AdminProviderService(repository);

    await expect(
      service.createProvider({ name: "Chase", defaultCategory: "not-a-category" as never }),
    ).rejects.toThrow(InvalidProviderInputError);
  });

  it("rejects a malformed websiteUrl", async () => {
    const repository = createFakeRepository();
    const service = new AdminProviderService(repository);

    await expect(
      service.createProvider({ name: "Chase", defaultCategory: "financial", websiteUrl: "not-a-url" }),
    ).rejects.toThrow(InvalidProviderInputError);
  });

  it("accepts a valid websiteUrl", async () => {
    const provider = makeProvider({ websiteUrl: "https://chase.com" });
    const repository = createFakeRepository({ createProvider: vi.fn().mockResolvedValue(provider) });
    const service = new AdminProviderService(repository);

    await service.createProvider({ name: "Chase", defaultCategory: "financial", websiteUrl: "https://chase.com" });

    expect(repository.createProvider).toHaveBeenCalledWith(
      expect.objectContaining({ websiteUrl: "https://chase.com" }),
    );
  });

  it(`rejects notes longer than ${MAX_NOTES_LENGTH} characters`, async () => {
    const repository = createFakeRepository();
    const service = new AdminProviderService(repository);

    await expect(
      service.createProvider({ name: "Chase", defaultCategory: "financial", notes: "x".repeat(MAX_NOTES_LENGTH + 1) }),
    ).rejects.toThrow(InvalidProviderInputError);
  });

  it("accepts a valid closureInstructions", async () => {
    const provider = makeProvider({ closureInstructions: "Call the bereavement line and provide a death certificate." });
    const repository = createFakeRepository({ createProvider: vi.fn().mockResolvedValue(provider) });
    const service = new AdminProviderService(repository);

    await service.createProvider({
      name: "Chase",
      defaultCategory: "financial",
      closureInstructions: "Call the bereavement line and provide a death certificate.",
    });

    expect(repository.createProvider).toHaveBeenCalledWith(
      expect.objectContaining({ closureInstructions: "Call the bereavement line and provide a death certificate." }),
    );
  });

  it(`rejects closureInstructions longer than ${MAX_CLOSURE_INSTRUCTIONS_LENGTH} characters`, async () => {
    const repository = createFakeRepository();
    const service = new AdminProviderService(repository);

    await expect(
      service.createProvider({
        name: "Chase",
        defaultCategory: "financial",
        closureInstructions: "x".repeat(MAX_CLOSURE_INSTRUCTIONS_LENGTH + 1),
      }),
    ).rejects.toThrow(InvalidProviderInputError);
  });

  it("translates a repository forbidden error", async () => {
    const repository = createFakeRepository({
      createProvider: vi.fn().mockRejectedValue(new Error("new row violates row-level security policy")),
    });
    const service = new AdminProviderService(repository);

    await expect(service.createProvider({ name: "Chase", defaultCategory: "financial" })).rejects.toThrow(
      ProviderForbiddenError,
    );
  });
});

describe("AdminProviderService.listProviders", () => {
  it("delegates to the repository", async () => {
    const providers = [makeProvider()];
    const repository = createFakeRepository({ listProviders: vi.fn().mockResolvedValue(providers) });
    const service = new AdminProviderService(repository);

    await expect(service.listProviders()).resolves.toBe(providers);
  });
});

describe("AdminProviderService.updateProvider", () => {
  it("only forwards fields that were provided", async () => {
    const provider = makeProvider({ name: "Chase Bank" });
    const repository = createFakeRepository({ updateProvider: vi.fn().mockResolvedValue(provider) });
    const service = new AdminProviderService(repository);

    await service.updateProvider("provider-1", { name: "Chase Bank" });

    expect(repository.updateProvider).toHaveBeenCalledWith("provider-1", { name: "Chase Bank" });
  });

  it("throws when no fields are provided", async () => {
    const repository = createFakeRepository();
    const service = new AdminProviderService(repository);

    await expect(service.updateProvider("provider-1", {})).rejects.toThrow(InvalidProviderInputError);
    expect(repository.updateProvider).not.toHaveBeenCalled();
  });
});
