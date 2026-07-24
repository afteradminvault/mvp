"use client";

import { useState, type FormEvent } from "react";
import { useVaultSession } from "./vault-session-context";

/**
 * The key-recovery step (Security Architecture §1.2) for an Executor,
 * proving the unwrap chain works. Deliberately stops at "vault key
 * recovered" rather than listing/decrypting assets here — the full
 * read-only asset/vault-item view for the Executor is Milestone 2 feature
 * 6, built on top of this same vaultKey via useVaultSession().
 */
export function ExecutorVaultUnlock({ estateId }: { estateId: string }) {
  const { vaultKey, unlock, isUnlocking, error } = useVaultSession();
  const [password, setPassword] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    unlock(estateId, password, "executor")
      .then(() => setPassword(""))
      .catch(() => {
        // Error already surfaced via the vault session context's own state.
      });
  }

  if (vaultKey) {
    return (
      <div className="rounded border border-green-300 bg-green-50 p-4">
        <p className="text-sm text-green-800">
          Vault key recovered for this session. It exists only in this browser tab&apos;s memory and is never sent
          anywhere — you&apos;ll need to unlock again if you leave and come back.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded border border-gray-300 p-4">
      <h2 className="mb-2 text-lg font-medium">Recover vault access</h2>
      <p className="mb-4 text-sm text-gray-600">
        Enter your account password to unwrap your copy of this estate&apos;s vault key for this browser session.
        Nothing is stored anywhere or sent back to the server.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Account password"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={isUnlocking}
          className="w-fit rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {isUnlocking ? "Unlocking..." : "Recover vault key"}
        </button>
      </form>
    </div>
  );
}
