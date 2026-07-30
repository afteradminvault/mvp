"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useVaultSession } from "../vault-session-context";
import type { ExecutorVerification } from "@/domain/executor-verification/ports";

interface MemberSummary {
  id: string;
  role: string;
  inviteEmail: string;
  inviteStatus: string;
  fallbackOrder: number | null;
  hasWrappedVaultKey: boolean;
}

const STATUS_LABELS: Record<ExecutorVerification["status"], string> = {
  pending: "Verification not started",
  id_uploaded: "ID uploaded — legal terms not yet accepted",
  terms_accepted: "Awaiting your review",
  family_approved: "Approved — finishing up",
  fully_verified: "Fully verified",
  declined: "Declined",
};

export function MemberRow({
  estateId,
  member,
  verification = null,
  isFamilyViewer = false,
  isSelf = false,
}: {
  estateId: string;
  member: MemberSummary;
  verification?: ExecutorVerification | null;
  isFamilyViewer?: boolean;
  isSelf?: boolean;
}) {
  const router = useRouter();
  const { vaultKey, unlock, isUnlocking } = useVaultSession();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const needsKeyShare = member.role === "executor" && member.inviteStatus === "accepted" && !member.hasWrappedVaultKey;

  function handleUploadId(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileName", file.name);
      const response = await fetch(`/api/estates/${estateId}/members/${member.id}/verification/id-upload`, {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  function handleAcceptTerms() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/estates/${estateId}/members/${member.id}/verification/accept-terms`, {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  function handleDecide(approved: boolean) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/estates/${estateId}/members/${member.id}/verification/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  function handleUnlockSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await unlock(estateId, password, "family");
        setPassword("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not unlock the vault.");
      }
    });
  }

  function handleWrapKeyShare() {
    if (!vaultKey) return;
    setError(null);
    startTransition(async () => {
      try {
        const { hexToBytes, bytesToHex } = await import("@/crypto/encoding");
        const { wrapVaultKeyForMember } = await import("@/crypto/vault-key-hierarchy");

        const keysResponse = await fetch(`/api/estates/${estateId}/members/keys`);
        const keysResult = await keysResponse.json();
        if (!keysResponse.ok) {
          throw new Error(keysResult.error ?? "Could not load member public keys.");
        }
        const entry = (keysResult.publicKeys as { memberId: string; publicKey: string }[]).find(
          (k) => k.memberId === member.id,
        );
        if (!entry) {
          throw new Error("This member hasn't generated a keypair yet — they need to accept their invite first.");
        }

        const memberPublicKey = await hexToBytes(entry.publicKey);
        const sealed = await wrapVaultKeyForMember(vaultKey, memberPublicKey);

        const response = await fetch(`/api/estates/${estateId}/members/${member.id}/wrap-key-share`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sealedVaultKey: await bytesToHex(sealed) }),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error ?? "Something went wrong.");
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not wrap the key share.");
      }
    });
  }

  function handleRevoke() {
    if (
      !window.confirm(
        member.hasWrappedVaultKey
          ? "Revoke this member? They'll immediately lose all further access. If they already viewed the vault, revoking can't erase what they've already seen."
          : "Revoke this member's invitation?",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/estates/${estateId}/members/${member.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="rounded border border-gray-300 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{member.inviteEmail}</p>
          <p className="text-sm text-gray-600">
            {member.role}
            {member.fallbackOrder ? ` (backup order ${member.fallbackOrder})` : ""} &middot; {member.inviteStatus}
            {member.hasWrappedVaultKey ? " · has vault key share" : ""}
          </p>
        </div>
        {member.inviteStatus !== "revoked" && (
          <button onClick={handleRevoke} disabled={isPending} className="text-sm text-red-600 underline disabled:opacity-50">
            Revoke
          </button>
        )}
      </div>

      {member.role === "executor" && member.inviteStatus === "accepted" && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          <p className="text-sm font-medium">{STATUS_LABELS[verification?.status ?? "pending"]}</p>

          {isSelf && verification?.status !== "fully_verified" && verification?.status !== "declined" && (
            <div className="mt-2 flex flex-col gap-2">
              {!verification?.idDocumentStoragePath && (
                <form onSubmit={handleUploadId} className="flex flex-col gap-2">
                  <p className="text-xs text-gray-600">
                    Upload a government ID so your Family member can verify it&apos;s really you.
                  </p>
                  <input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.webp" className="text-sm" />
                  <button
                    type="submit"
                    disabled={isPending}
                    className="w-fit rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    {isPending ? "Uploading..." : "Upload ID"}
                  </button>
                </form>
              )}
              {verification?.idDocumentStoragePath && !verification?.legalTermsAcceptedAt && (
                <button
                  onClick={handleAcceptTerms}
                  disabled={isPending}
                  className="w-fit rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  {isPending ? "Recording..." : "Accept legal terms"}
                </button>
              )}
            </div>
          )}

          {isFamilyViewer && !isSelf && verification && verification.status !== "declined" && (
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => handleDecide(true)}
                disabled={isPending}
                className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => handleDecide(false)}
                disabled={isPending}
                className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          )}

          {isFamilyViewer && !isSelf && verification?.status === "declined" && (
            <button
              onClick={() => handleDecide(true)}
              disabled={isPending}
              className="mt-2 w-fit rounded border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Reconsider &amp; approve
            </button>
          )}
        </div>
      )}

      {needsKeyShare && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          {verification?.status !== "fully_verified" ? (
            <p className="text-xs text-gray-600">Vault access can be granted once this Executor is fully verified above.</p>
          ) : vaultKey ? (
            <button
              onClick={handleWrapKeyShare}
              disabled={isPending}
              className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {isPending ? "Wrapping..." : "Grant vault access (wrap key share)"}
            </button>
          ) : (
            <form onSubmit={handleUnlockSubmit} className="flex flex-col gap-2">
              <p className="text-xs text-gray-600">
                Unlock your vault to grant this Executor access to it.
              </p>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Account password"
                className="rounded border border-gray-300 px-3 py-1.5 text-sm"
              />
              <button
                type="submit"
                disabled={isUnlocking}
                className="w-fit rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {isUnlocking ? "Unlocking..." : "Unlock"}
              </button>
            </form>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </li>
  );
}
