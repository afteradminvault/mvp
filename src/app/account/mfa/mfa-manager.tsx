"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  beginMfaEnrollmentAction,
  completeMfaEnrollmentAction,
  listMfaFactorsAction,
  removeMfaFactorAction,
} from "@/app/actions/auth";
import type { MfaFactor, TotpEnrollment } from "@/domain/auth/ports";

export function MfaManager({ initialFactors }: { initialFactors: MfaFactor[] }) {
  const router = useRouter();
  const [factors, setFactors] = useState(initialFactors);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasVerifiedFactor = factors.some((factor) => factor.status === "verified");

  function handleBeginEnrollment() {
    setError(null);
    startTransition(async () => {
      const result = await beginMfaEnrollmentAction();
      if (!result.success) {
        setError(result.error);
        return;
      }
      setEnrollment(result.data);
    });
  }

  function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollment) return;
    setError(null);
    startTransition(async () => {
      const result = await completeMfaEnrollmentAction({ factorId: enrollment.factorId, code });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setEnrollment(null);
      setCode("");
      router.refresh();
      const refreshed = await listMfaFactorsAction();
      if (refreshed.success) {
        setFactors(refreshed.data);
      }
    });
  }

  function handleRemove(factorId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeMfaFactorAction(factorId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setFactors((current) => current.filter((factor) => factor.id !== factorId));
      router.refresh();
    });
  }

  if (enrollment) {
    return (
      <form onSubmit={handleVerify} className="flex flex-col gap-4">
        <p className="text-sm">Scan this QR code with your authenticator app:</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns a data: URI, not an optimizable remote image */}
        <img src={enrollment.qrCodeSvg} alt="MFA enrollment QR code" className="h-40 w-40" />
        <p className="text-xs text-gray-600">
          Can&apos;t scan it? Enter this code manually: <code className="font-mono">{enrollment.secret}</code>
        </p>
        <label className="flex flex-col gap-1 text-sm">
          6-digit code from your app
          <input
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {isPending ? "Verifying..." : "Verify and enable"}
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {factors.length > 0 && (
        <ul className="flex flex-col gap-2">
          {factors.map((factor) => (
            <li
              key={factor.id}
              className="flex items-center justify-between rounded border border-gray-300 p-3 text-sm"
            >
              <span>
                Authenticator app — {factor.status === "verified" ? "active" : "pending verification"}
              </span>
              <button
                onClick={() => handleRemove(factor.id)}
                disabled={isPending}
                className="text-sm text-red-600 underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {!hasVerifiedFactor && (
        <button
          onClick={handleBeginEnrollment}
          disabled={isPending}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {isPending ? "Starting..." : "Set up authenticator app"}
        </button>
      )}
    </div>
  );
}
