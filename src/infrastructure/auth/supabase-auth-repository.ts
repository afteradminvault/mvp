import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AuthRepository,
  AuthSession,
  AuthUser,
  MfaFactor,
  TotpEnrollment,
} from "@/domain/auth/ports";
import { clientEnv } from "@/config/env";

/**
 * Concrete implementation of the AuthRepository port against a real
 * Supabase client. Takes the client via constructor injection so callers
 * decide whether it's wired to the browser client or the server client
 * (see src/infrastructure/supabase/*) — this class doesn't know or care
 * which.
 */
export class SupabaseAuthRepository implements AuthRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async signUp(params: { email: string; password: string; displayName: string }): Promise<AuthUser> {
    const { data, error } = await this.supabase.auth.signUp({
      email: params.email,
      password: params.password,
      options: {
        data: { display_name: params.displayName },
        // Explicit, not left to Supabase's dashboard-configured Site URL
        // default — that setting is one value for the whole project, so it
        // silently points at whatever was last configured (e.g. localhost
        // during local dev) regardless of which environment the signup
        // actually happened in. This makes the confirmation link land back
        // on the environment that issued it. Still requires this exact URL
        // to be in Supabase's Redirect URLs allowlist (Authentication ->
        // URL Configuration), or Supabase rejects it.
        emailRedirectTo: `${clientEnv.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    });
    if (error) throw error;
    if (!data.user) throw new Error("Sign-up succeeded but no user was returned.");
    return { id: data.user.id, email: data.user.email ?? params.email };
  }

  async signIn(params: { email: string; password: string }): Promise<AuthSession> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email: params.email,
      password: params.password,
    });
    if (error) throw error;
    return { user: { id: data.user.id, email: data.user.email ?? params.email } };
  }

  async signOut(): Promise<void> {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
  }

  async getSession(): Promise<AuthSession | null> {
    // getUser() (not getSession()) deliberately: it revalidates against
    // Supabase Auth rather than trusting a possibly-stale local cookie,
    // which matters for a security-sensitive check like this one.
    const { data, error } = await this.supabase.auth.getUser();
    if (error || !data.user) return null;
    return { user: { id: data.user.id, email: data.user.email ?? "" } };
  }

  async enrollTotpFactor(): Promise<TotpEnrollment> {
    const { data, error } = await this.supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error) throw error;
    return {
      factorId: data.id,
      qrCodeSvg: data.totp.qr_code,
      secret: data.totp.secret,
    };
  }

  async verifyTotpEnrollment(params: { factorId: string; code: string }): Promise<void> {
    const { data: challenge, error: challengeError } = await this.supabase.auth.mfa.challenge({
      factorId: params.factorId,
    });
    if (challengeError) throw challengeError;

    const { error: verifyError } = await this.supabase.auth.mfa.verify({
      factorId: params.factorId,
      challengeId: challenge.id,
      code: params.code,
    });
    if (verifyError) throw verifyError;
  }

  async listMfaFactors(): Promise<MfaFactor[]> {
    const { data, error } = await this.supabase.auth.mfa.listFactors();
    if (error) throw error;
    return data.totp.map((factor) => ({
      id: factor.id,
      status: factor.status === "verified" ? "verified" : "unverified",
    }));
  }

  async unenrollMfaFactor(factorId: string): Promise<void> {
    const { error } = await this.supabase.auth.mfa.unenroll({ factorId });
    if (error) throw error;
  }

  async setMfaEnabledFlag(params: { userId: string; enabled: boolean }): Promise<void> {
    const { error } = await this.supabase
      .from("users")
      .update({ mfa_enabled: params.enabled })
      .eq("id", params.userId);
    if (error) throw error;
  }
}
