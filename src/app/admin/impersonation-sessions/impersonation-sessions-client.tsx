"use client";

import { useState, useTransition } from "react";

interface SessionSummary {
  id: string;
  adminUserId: string;
  targetUserId: string;
  startedAt: string;
  endedAt: string | null;
}

export function ImpersonationSessionsClient({ initialSessions }: { initialSessions: SessionSummary[] }) {
  const [sessions, setSessions] = useState(initialSessions);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleEnd(sessionId: string) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/admin/impersonation-sessions/${sessionId}/end`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setSessions((current) =>
        current.map((s) => (s.id === sessionId ? { ...s, endedAt: new Date().toISOString() } : s)),
      );
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="flex flex-col gap-2">
        {sessions.map((session) => (
          <li key={session.id} className="flex items-center justify-between rounded border border-gray-300 p-3 text-sm">
            <div>
              <p>Target user: {session.targetUserId}</p>
              <p className="text-gray-600">
                Started {new Date(session.startedAt).toLocaleString()}
                {session.endedAt ? ` · ended ${new Date(session.endedAt).toLocaleString()}` : " · active"}
              </p>
            </div>
            {!session.endedAt && (
              <button onClick={() => handleEnd(session.id)} disabled={isPending} className="text-sm underline disabled:opacity-50">
                End
              </button>
            )}
          </li>
        ))}
        {sessions.length === 0 && <p className="text-sm text-gray-600">No impersonation sessions yet.</p>}
      </ul>
    </div>
  );
}
