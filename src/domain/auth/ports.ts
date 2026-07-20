/**
 * Auth domain contracts. No Supabase or Next.js imports here — this is the
 * boundary the domain layer depends on (dependency inversion), and
 * `src/infrastructure/auth/supabase-auth-repository.ts` is the concrete
 * adapter that implements it. Keeping this file framework-free is what lets
 * `auth-service.test.ts` unit-test business logic against a fake, with no
 * network/Supabase dependency.
 */

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthSession {
  user: AuthUser;
}

export interface TotpEnrollment {
  factorId: string;
  qrCodeSvg: string;
  secret: string;
}

export interface MfaFactor {
  id: string;
  status: "verified" | "unverified";
}

export interface AuthRepository {
  signUp(params: { email: string; password: string; displayName: string }): Promise<AuthUser>;
  signIn(params: { email: string; password: string }): Promise<AuthSession>;
  signOut(): Promise<void>;
  getSession(): Promise<AuthSession | null>;

  enrollTotpFactor(): Promise<TotpEnrollment>;
  verifyTotpEnrollment(params: { factorId: string; code: string }): Promise<void>;
  listMfaFactors(): Promise<MfaFactor[]>;
  unenrollMfaFactor(factorId: string): Promise<void>;

  /** Syncs users.mfa_enabled after a factor is verified/removed — see docs/SECURITY_ARCHITECTURE.md §3.1. */
  setMfaEnabledFlag(params: { userId: string; enabled: boolean }): Promise<void>;
}
