"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function AcceptInviteForm({ token, isLoggedIn }: { token: string; isLoggedIn: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-600">
          Log in or create an account, then come back to this same link to accept.
        </p>
        <div className="flex gap-4 text-sm">
          <a href={`/login`} className="underline">
            Log in
          </a>
          <a href={`/signup`} className="underline">
            Sign up
          </a>
        </div>
      </div>
    );
  }

  if (accepted) {
    return (
      <p className="text-sm text-green-600">
        You&apos;ve accepted this nomination. The Owner will grant vault access the next time they&apos;re online.
      </p>
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const { bytesToHex } = await import("@/crypto/encoding");
        const { generateKeyPair } = await import("@/crypto/asymmetric");
        const { generateKdfSalt } = await import("@/crypto/kdf");
        const { derivePrivateKeyWrappingKey, wrapPrivateKeyForSelf } = await import("@/crypto/vault-key-hierarchy");
        const { packEncryptedPayload } = await import("@/crypto/wire-format");

        const keyPair = await generateKeyPair();
        const salt = await generateKdfSalt();
        const wrappingKey = await derivePrivateKeyWrappingKey(password, salt);
        const wrappedPrivateKey = await wrapPrivateKeyForSelf(keyPair.privateKey, wrappingKey);
        const packedWrappedPrivateKey = await packEncryptedPayload(wrappedPrivateKey);

        const response = await fetch(`/api/invites/${token}/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicKey: await bytesToHex(keyPair.publicKey),
            wrappedPrivateKey: await bytesToHex(packedWrappedPrivateKey),
            kdfSalt: await bytesToHex(salt),
          }),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error ?? "Something went wrong.");
        }
        setAccepted(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not accept this invitation.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-sm text-gray-600">
        Your account password protects your access to this estate&apos;s vault — it&apos;s used here to secure a
        device key, not sent anywhere in plaintext.
      </p>
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
        disabled={isPending}
        className="w-fit rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {isPending ? "Accepting..." : "Accept invitation"}
      </button>
    </form>
  );
}
