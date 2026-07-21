import { describe, expect, it, vi } from "vitest";
import type { VaultKeyRepository } from "./ports";
import {
  InvalidVaultKeyInputError,
  VaultKeyAlreadyInitializedError,
  VaultKeyForbiddenError,
  VaultKeyService,
} from "./vault-key-service";

function createFakeRepository(overrides: Partial<VaultKeyRepository> = {}): VaultKeyRepository {
  return {
    getOwnerVaultKeyState: vi.fn(),
    initializeOwnerVaultKey: vi.fn(),
    ...overrides,
  };
}

describe("VaultKeyService.getOwnerVaultKeyState", () => {
  it("delegates directly to the repository", async () => {
    const state = { wrappedVaultKey: null, kdfSalt: null };
    const repository = createFakeRepository({ getOwnerVaultKeyState: vi.fn().mockResolvedValue(state) });
    const service = new VaultKeyService(repository);

    await expect(service.getOwnerVaultKeyState("estate-1")).resolves.toBe(state);
  });

  it("translates a repository 'only the estate owner' error into VaultKeyForbiddenError", async () => {
    const repository = createFakeRepository({
      getOwnerVaultKeyState: vi.fn().mockRejectedValue(new Error("only the estate owner can access this")),
    });
    const service = new VaultKeyService(repository);

    await expect(service.getOwnerVaultKeyState("estate-1")).rejects.toThrow(VaultKeyForbiddenError);
  });
});

describe("VaultKeyService.initializeOwnerVaultKey", () => {
  it("initializes with a wrapped vault key and kdf salt", async () => {
    const state = { wrappedVaultKey: "aabbcc", kdfSalt: "112233" };
    const repository = createFakeRepository({ initializeOwnerVaultKey: vi.fn().mockResolvedValue(state) });
    const service = new VaultKeyService(repository);

    const result = await service.initializeOwnerVaultKey("estate-1", {
      wrappedVaultKey: "aabbcc",
      kdfSalt: "112233",
    });

    expect(repository.initializeOwnerVaultKey).toHaveBeenCalledWith("estate-1", {
      wrappedVaultKey: "aabbcc",
      kdfSalt: "112233",
    });
    expect(result).toBe(state);
  });

  it("allows omitting kdfSalt (account already has one)", async () => {
    const state = { wrappedVaultKey: "aabbcc", kdfSalt: "112233" };
    const repository = createFakeRepository({ initializeOwnerVaultKey: vi.fn().mockResolvedValue(state) });
    const service = new VaultKeyService(repository);

    await service.initializeOwnerVaultKey("estate-1", { wrappedVaultKey: "aabbcc" });

    expect(repository.initializeOwnerVaultKey).toHaveBeenCalledWith("estate-1", {
      wrappedVaultKey: "aabbcc",
      kdfSalt: undefined,
    });
  });

  it("rejects a missing wrappedVaultKey", async () => {
    const repository = createFakeRepository();
    const service = new VaultKeyService(repository);

    await expect(
      service.initializeOwnerVaultKey("estate-1", { wrappedVaultKey: "" }),
    ).rejects.toThrow(InvalidVaultKeyInputError);
    expect(repository.initializeOwnerVaultKey).not.toHaveBeenCalled();
  });

  it("rejects a non-hex wrappedVaultKey", async () => {
    const repository = createFakeRepository();
    const service = new VaultKeyService(repository);

    await expect(
      service.initializeOwnerVaultKey("estate-1", { wrappedVaultKey: "not-hex!" }),
    ).rejects.toThrow(InvalidVaultKeyInputError);
  });

  it("translates a repository 'already initialized' error into VaultKeyAlreadyInitializedError", async () => {
    const repository = createFakeRepository({
      initializeOwnerVaultKey: vi.fn().mockRejectedValue(new Error("vault key already initialized for this estate")),
    });
    const service = new VaultKeyService(repository);

    await expect(
      service.initializeOwnerVaultKey("estate-1", { wrappedVaultKey: "aabbcc" }),
    ).rejects.toThrow(VaultKeyAlreadyInitializedError);
  });

  it("translates a repository 'only the estate owner' error into VaultKeyForbiddenError", async () => {
    const repository = createFakeRepository({
      initializeOwnerVaultKey: vi.fn().mockRejectedValue(new Error("only the estate owner can initialize its vault key")),
    });
    const service = new VaultKeyService(repository);

    await expect(
      service.initializeOwnerVaultKey("estate-1", { wrappedVaultKey: "aabbcc" }),
    ).rejects.toThrow(VaultKeyForbiddenError);
  });

  it("re-throws unrelated repository errors as-is", async () => {
    const repository = createFakeRepository({
      initializeOwnerVaultKey: vi.fn().mockRejectedValue(new Error("network error")),
    });
    const service = new VaultKeyService(repository);

    await expect(
      service.initializeOwnerVaultKey("estate-1", { wrappedVaultKey: "aabbcc" }),
    ).rejects.toThrow("network error");
  });
});
