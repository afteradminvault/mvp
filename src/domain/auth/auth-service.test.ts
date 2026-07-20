import { describe, expect, it, vi } from "vitest";
import type { AuthRepository, AuthSession, AuthUser, MfaFactor, TotpEnrollment } from "./ports";
import {
  AuthService,
  InvalidCredentialsError,
  InvalidSignUpInputError,
  MIN_PASSWORD_LENGTH,
} from "./auth-service";

function createFakeRepository(overrides: Partial<AuthRepository> = {}): AuthRepository {
  return {
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
    enrollTotpFactor: vi.fn(),
    verifyTotpEnrollment: vi.fn(),
    listMfaFactors: vi.fn(),
    unenrollMfaFactor: vi.fn(),
    setMfaEnabledFlag: vi.fn(),
    ...overrides,
  };
}

const validPassword = "a-very-long-password-123";
const user: AuthUser = { id: "user-1", email: "diane@example.com" };
const session: AuthSession = { user };

describe("AuthService.signUp", () => {
  it("delegates to the repository with trimmed email/displayName when input is valid", async () => {
    const repository = createFakeRepository({ signUp: vi.fn().mockResolvedValue(user) });
    const service = new AuthService(repository);

    const result = await service.signUp({
      email: "  diane@example.com  ",
      password: validPassword,
      displayName: "  Diane  ",
    });

    expect(repository.signUp).toHaveBeenCalledWith({
      email: "diane@example.com",
      password: validPassword,
      displayName: "Diane",
    });
    expect(result).toBe(user);
  });

  it("rejects an invalid email without calling the repository", async () => {
    const repository = createFakeRepository();
    const service = new AuthService(repository);

    await expect(
      service.signUp({ email: "not-an-email", password: validPassword, displayName: "Diane" }),
    ).rejects.toThrow(InvalidSignUpInputError);
    expect(repository.signUp).not.toHaveBeenCalled();
  });

  it("rejects an empty display name", async () => {
    const repository = createFakeRepository();
    const service = new AuthService(repository);

    await expect(
      service.signUp({ email: "diane@example.com", password: validPassword, displayName: "   " }),
    ).rejects.toThrow(InvalidSignUpInputError);
  });

  it(`rejects a password shorter than ${MIN_PASSWORD_LENGTH} characters`, async () => {
    const repository = createFakeRepository();
    const service = new AuthService(repository);

    await expect(
      service.signUp({ email: "diane@example.com", password: "short", displayName: "Diane" }),
    ).rejects.toThrow(new RegExp(`${MIN_PASSWORD_LENGTH} characters`));
  });

  it(`accepts a password exactly ${MIN_PASSWORD_LENGTH} characters long`, async () => {
    const repository = createFakeRepository({ signUp: vi.fn().mockResolvedValue(user) });
    const service = new AuthService(repository);
    const boundaryPassword = "x".repeat(MIN_PASSWORD_LENGTH);

    await expect(
      service.signUp({ email: "diane@example.com", password: boundaryPassword, displayName: "Diane" }),
    ).resolves.toBe(user);
  });
});

describe("AuthService.signIn", () => {
  it("delegates to the repository for valid credentials", async () => {
    const repository = createFakeRepository({ signIn: vi.fn().mockResolvedValue(session) });
    const service = new AuthService(repository);

    const result = await service.signIn({ email: "diane@example.com", password: "whatever" });

    expect(repository.signIn).toHaveBeenCalledWith({
      email: "diane@example.com",
      password: "whatever",
    });
    expect(result).toBe(session);
  });

  it("rejects an empty password without calling the repository", async () => {
    const repository = createFakeRepository();
    const service = new AuthService(repository);

    await expect(
      service.signIn({ email: "diane@example.com", password: "" }),
    ).rejects.toThrow(InvalidCredentialsError);
    expect(repository.signIn).not.toHaveBeenCalled();
  });
});

describe("AuthService.completeMfaEnrollment", () => {
  it("verifies the factor, then marks mfa_enabled true for the current session's user", async () => {
    const repository = createFakeRepository({
      verifyTotpEnrollment: vi.fn().mockResolvedValue(undefined),
      getSession: vi.fn().mockResolvedValue(session),
      setMfaEnabledFlag: vi.fn().mockResolvedValue(undefined),
    });
    const service = new AuthService(repository);

    await service.completeMfaEnrollment({ factorId: "factor-1", code: "123456" });

    expect(repository.verifyTotpEnrollment).toHaveBeenCalledWith({
      factorId: "factor-1",
      code: "123456",
    });
    expect(repository.setMfaEnabledFlag).toHaveBeenCalledWith({ userId: user.id, enabled: true });
  });

  it("does not mark mfa_enabled if verification throws", async () => {
    const repository = createFakeRepository({
      verifyTotpEnrollment: vi.fn().mockRejectedValue(new Error("bad code")),
      setMfaEnabledFlag: vi.fn(),
    });
    const service = new AuthService(repository);

    await expect(
      service.completeMfaEnrollment({ factorId: "factor-1", code: "000000" }),
    ).rejects.toThrow("bad code");
    expect(repository.setMfaEnabledFlag).not.toHaveBeenCalled();
  });

  it("throws if verification succeeds but there is no active session", async () => {
    const repository = createFakeRepository({
      verifyTotpEnrollment: vi.fn().mockResolvedValue(undefined),
      getSession: vi.fn().mockResolvedValue(null),
      setMfaEnabledFlag: vi.fn(),
    });
    const service = new AuthService(repository);

    await expect(
      service.completeMfaEnrollment({ factorId: "factor-1", code: "123456" }),
    ).rejects.toThrow(InvalidCredentialsError);
    expect(repository.setMfaEnabledFlag).not.toHaveBeenCalled();
  });
});

describe("AuthService.removeMfaFactor", () => {
  it("flips mfa_enabled to false when no verified factors remain", async () => {
    const repository = createFakeRepository({
      unenrollMfaFactor: vi.fn().mockResolvedValue(undefined),
      listMfaFactors: vi.fn().mockResolvedValue([] as MfaFactor[]),
      getSession: vi.fn().mockResolvedValue(session),
      setMfaEnabledFlag: vi.fn().mockResolvedValue(undefined),
    });
    const service = new AuthService(repository);

    await service.removeMfaFactor("factor-1");

    expect(repository.unenrollMfaFactor).toHaveBeenCalledWith("factor-1");
    expect(repository.setMfaEnabledFlag).toHaveBeenCalledWith({ userId: user.id, enabled: false });
  });

  it("leaves mfa_enabled untouched when another verified factor still exists", async () => {
    const repository = createFakeRepository({
      unenrollMfaFactor: vi.fn().mockResolvedValue(undefined),
      listMfaFactors: vi
        .fn()
        .mockResolvedValue([{ id: "factor-2", status: "verified" }] as MfaFactor[]),
      setMfaEnabledFlag: vi.fn(),
    });
    const service = new AuthService(repository);

    await service.removeMfaFactor("factor-1");

    expect(repository.setMfaEnabledFlag).not.toHaveBeenCalled();
  });
});

describe("AuthService.beginMfaEnrollment / listMfaFactors / signOut / getSession", () => {
  it("beginMfaEnrollment delegates directly to the repository", async () => {
    const enrollment: TotpEnrollment = { factorId: "f1", qrCodeSvg: "<svg/>", secret: "SECRET" };
    const repository = createFakeRepository({ enrollTotpFactor: vi.fn().mockResolvedValue(enrollment) });
    const service = new AuthService(repository);

    await expect(service.beginMfaEnrollment()).resolves.toBe(enrollment);
  });

  it("signOut delegates directly to the repository", async () => {
    const repository = createFakeRepository({ signOut: vi.fn().mockResolvedValue(undefined) });
    const service = new AuthService(repository);

    await service.signOut();
    expect(repository.signOut).toHaveBeenCalledOnce();
  });

  it("getSession delegates directly to the repository", async () => {
    const repository = createFakeRepository({ getSession: vi.fn().mockResolvedValue(session) });
    const service = new AuthService(repository);

    await expect(service.getSession()).resolves.toBe(session);
  });
});
