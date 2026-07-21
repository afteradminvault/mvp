"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function InviteMemberForm({ estateId }: { estateId: string }) {
  const router = useRouter();
  const [inviteEmail, setInviteEmail] = useState("");
  const [role, setRole] = useState<"executor" | "helper">("executor");
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInviteUrl(null);
    startTransition(async () => {
      const response = await fetch(`/api/estates/${estateId}/members/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteEmail, role }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setInviteUrl(result.inviteUrl);
      setInviteEmail("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          type="email"
          required
          value={inviteEmail}
          onChange={(event) => setInviteEmail(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Role
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as "executor" | "helper")}
          className="rounded border border-gray-300 px-3 py-2"
        >
          <option value="executor">Executor</option>
          <option value="helper">Helper (view-only, no vault access)</option>
        </select>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {inviteUrl && (
        <p className="rounded bg-gray-100 p-3 text-sm">
          Invite created. This step doesn&apos;t send an email yet — copy this link and send it yourself:
          <br />
          <span className="break-all font-mono">{inviteUrl}</span>
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {isPending ? "Sending invite..." : "Send invite"}
      </button>
    </form>
  );
}
