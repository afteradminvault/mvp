"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useVaultSession } from "../vault-session-context";

interface MemberSummary {
  id: string;
  role: string;
  inviteEmail: string;
  inviteStatus: string;
  fallbackOrder: number | null;
  hasWrappedVaultKey: boolean;
}

export function MemberRow({ estateId, member }: { estateId: string; member: MemberSummary }) {
  const router = useRouter();
  const { vaultKey, unlock, isUnlocking } = useVaultSession();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const needsKeyShare = member.role === "executor" && member.inviteStatus === "accepted" && !member.hasWrappedVaultKey;

  function handleUnlockSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await unlock(estateId, password, "owner");
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

      {needsKeyShare && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          {vaultKey ? (
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
