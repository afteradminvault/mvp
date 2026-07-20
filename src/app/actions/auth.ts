"use server";

import { AuthService } from "@/domain/auth/auth-service";
import type { MfaFactor, TotpEnrollment } from "@/domain/auth/ports";
import { SupabaseAuthRepository } from "@/infrastructure/auth/supabase-auth-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";

/**
 * Thin Server Actions: parse input, delegate to AuthService, translate the
 * result/error into a plain object a Client Component can render without
 * needing to catch a thrown Server Action error. All business logic
 * (validation, MFA-flag sequencing) lives in AuthService, not here.
 */

async function getAuthService(): Promise<AuthService> {
  const supabase = await createSupabaseServerClient();
  return new AuthService(new SupabaseAuthRepository(supabase));
}

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function toActionResult<T>(promise: Promise<T>): Promise<ActionResult<T>> {
  return promise
    .then((data) => ({ success: true as const, data }))
    .catch((error: unknown) => ({
      success: false as const,
      error: error instanceof Error ? error.message : "Something went wrong.",
    }));
}

export async function signUpAction(params: {
  email: string;
  password: string;
  displayName: string;
}): Promise<ActionResult<{ userId: string }>> {
  return toActionResult(
    getAuthService()
      .then((service) => service.signUp(params))
      .then((user) => ({ userId: user.id })),
  );
}

export async function signInAction(params: {
  email: string;
  password: string;
}): Promise<ActionResult<{ userId: string }>> {
  return toActionResult(
    getAuthService()
      .then((service) => service.signIn(params))
      .then((session) => ({ userId: session.user.id })),
  );
}

export async function signOutAction(): Promise<ActionResult<null>> {
  return toActionResult(
    getAuthService()
      .then((service) => service.signOut())
      .then(() => null),
  );
}

export async function beginMfaEnrollmentAction(): Promise<ActionResult<TotpEnrollment>> {
  return toActionResult(getAuthService().then((service) => service.beginMfaEnrollment()));
}

export async function completeMfaEnrollmentAction(params: {
  factorId: string;
  code: string;
}): Promise<ActionResult<null>> {
  return toActionResult(
    getAuthService()
      .then((service) => service.completeMfaEnrollment(params))
      .then(() => null),
  );
}

export async function listMfaFactorsAction(): Promise<ActionResult<MfaFactor[]>> {
  return toActionResult(getAuthService().then((service) => service.listMfaFactors()));
}

export async function removeMfaFactorAction(factorId: string): Promise<ActionResult<null>> {
  return toActionResult(
    getAuthService()
      .then((service) => service.removeMfaFactor(factorId))
      .then(() => null),
  );
}
