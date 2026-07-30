"use client";

import { useState, useTransition } from "react";
import type { AdminUser } from "@/domain/admin-users/ports";

/**
 * US-8.2 🔒 — impersonate opens a real Supabase session for the target
 * user via a one-time magic link, in a new tab. Since the admin's own
 * session and the impersonated session share the same browser cookie jar,
 * opening the link signs the admin OUT of their own admin session in this
 * browser — that's flagged explicitly below rather than silently
 * surprising whoever clicks it. Use a private/incognito window to keep
 * both sessions alive at once.
 */
export function AdminUsersClient({ initialUsers, initialTotal }: { initialUsers: AdminUser[]; initialTotal: number }) {
  const [users, setUsers] = useState(initialUsers);
  const [total, setTotal] = useState(initialTotal);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSearch() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/admin/users?search=${encodeURIComponent(search)}`);
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setUsers(result.users);
      setTotal(result.total);
    });
  }

  function handleToggleSuspend(user: AdminUser) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended: !user.suspendedAt }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setUsers((current) => current.map((u) => (u.id === user.id ? result.user : u)));
    });
  }

  function handleImpersonate(user: AdminUser) {
    if (
      !window.confirm(
        `Impersonate ${user.displayName}? This opens a new tab signed in as them — it will sign YOU out of this admin session in this browser (shared cookies). Use a private/incognito window if you need to stay signed in as both.`,
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const response = await fetch(`/api/admin/users/${user.id}/impersonate`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      window.open(result.impersonationSession.actionLink, "_blank", "noopener,noreferrer");
      setNotice(`Impersonation session started for ${user.displayName}. End it from the Impersonation sessions page when done.`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && handleSearch()}
          placeholder="Search by email or name"
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button onClick={handleSearch} disabled={isPending} className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
          Search
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}
      <p className="text-xs text-gray-600">{total} total</p>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-300 text-left text-gray-600">
            <th className="py-1.5 pr-2">Email</th>
            <th className="py-1.5 pr-2">Name</th>
            <th className="py-1.5 pr-2">MFA</th>
            <th className="py-1.5 pr-2">Status</th>
            <th className="py-1.5"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b border-gray-100">
              <td className="py-1.5 pr-2">{user.email}</td>
              <td className="py-1.5 pr-2">{user.displayName}</td>
              <td className="py-1.5 pr-2">{user.mfaEnabled ? "on" : "off"}</td>
              <td className="py-1.5 pr-2">{user.suspendedAt ? "suspended" : "active"}</td>
              <td className="flex gap-2 py-1.5">
                <button onClick={() => handleToggleSuspend(user)} disabled={isPending} className="underline disabled:opacity-50">
                  {user.suspendedAt ? "Unsuspend" : "Suspend"}
                </button>
                <button onClick={() => handleImpersonate(user)} disabled={isPending} className="underline disabled:opacity-50">
                  Impersonate
                </button>
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={5} className="py-3 text-gray-600">
                No users match this search.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
