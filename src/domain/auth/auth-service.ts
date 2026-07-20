import type { AuthRepository, AuthSession, AuthUser, TotpEnrollment } from "./ports";

/**
 * 12 chars, not the more common 8: this password also derives the
 * client-side Vault Key wrapping key via Argon2id (docs/SECURITY_ARCHITECTURE.md
 * §1.1), so account password strength is directly vault-key strength, not
 * just a login-guessing concern.
 */
export const MIN_PASSWORD_LENGTH = 12;

export class InvalidSignUpInputError extends Error {}
export class InvalidCredentialsError extends Error {}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Orchestrates auth use cases. Contains the business rules (password
 * policy, input validation, the enroll-then-mark-enabled sequencing for
 * MFA); delegates actual auth/session mechanics to the injected
 * AuthRepository. No Supabase, no Next.js — see ports.ts.
 */
export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

  async signUp(params: { email: string; password: string; displayName: string }): Promise<AuthUser> {
    const email = params.email.trim();
    const displayName = params.displayName.trim();

    if (!isValidEmail(email)) {
      throw new InvalidSignUpInputError("A valid email address is required.");
    }
    if (displayName.length === 0) {
      throw new InvalidSignUpInputError("A display name is required.");
    }
    if (params.password.length < MIN_PASSWORD_LENGTH) {
      throw new InvalidSignUpInputError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
    }

    return this.repository.signUp({ email, password: params.password, displayName });
  }

  async signIn(params: { email: string; password: string }): Promise<AuthSession> {
    const email = params.email.trim();
    if (!isValidEmail(email) || params.password.length === 0) {
      throw new InvalidCredentialsError("Email and password are required.");
    }
    return this.repository.signIn({ email, password: params.password });
  }

  async signOut(): Promise<void> {
    return this.repository.signOut();
  }

  async getSession(): Promise<AuthSession | null> {
    return this.repository.getSession();
  }

  async beginMfaEnrollment(): Promise<TotpEnrollment> {
    return this.repository.enrollTotpFactor();
  }

  /**
   * Completes TOTP enrollment and syncs users.mfa_enabled in one place, so
   * "verified with the provider but not reflected in our own DB" can't
   * happen from this code path. If verification fails, the flag is never
   * touched — no partial state.
   */
  async completeMfaEnrollment(params: { factorId: string; code: string }): Promise<void> {
    await this.repository.verifyTotpEnrollment(params);

    const session = await this.repository.getSession();
    if (!session) {
      throw new InvalidCredentialsError("No active session while completing MFA enrollment.");
    }
    await this.repository.setMfaEnabledFlag({ userId: session.user.id, enabled: true });
  }

  async listMfaFactors() {
    return this.repository.listMfaFactors();
  }

  /**
   * Removes a factor and, if no verified factors remain, flips
   * users.mfa_enabled back off — the flag should always reflect whether MFA
   * is *actually* enforceable, not just whether it was ever turned on once.
   */
  async removeMfaFactor(factorId: string): Promise<void> {
    await this.repository.unenrollMfaFactor(factorId);

    const remaining = await this.repository.listMfaFactors();
    const stillHasVerifiedFactor = remaining.some((factor) => factor.status === "verified");
    if (!stillHasVerifiedFactor) {
      const session = await this.repository.getSession();
      if (session) {
        await this.repository.setMfaEnabledFlag({ userId: session.user.id, enabled: false });
      }
    }
  }
}
