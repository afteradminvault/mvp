"use client";

import { useState, useTransition } from "react";
import type { SupportTicket, SupportTicketStatus } from "@/domain/admin-support-tickets/ports";

const STATUSES: SupportTicketStatus[] = ["open", "in_progress", "resolved", "closed"];

export function SupportTicketsClient({ initialTickets }: { initialTickets: SupportTicket[] }) {
  const [tickets, setTickets] = useState(initialTickets);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleStatusChange(ticketId: string, status: SupportTicketStatus) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/admin/support-tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setTickets((current) => current.map((t) => (t.id === ticketId ? result.ticket : t)));
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="flex flex-col gap-2">
        {tickets.map((ticket) => (
          <li key={ticket.id} className="rounded border border-gray-300 p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{ticket.subject}</p>
                <p className="text-gray-600">{ticket.fromEmail}</p>
                <p className="mt-1 whitespace-pre-wrap">{ticket.body}</p>
              </div>
              <select
                value={ticket.status}
                onChange={(event) => handleStatusChange(ticket.id, event.target.value as SupportTicketStatus)}
                disabled={isPending}
                className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs"
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          </li>
        ))}
        {tickets.length === 0 && <p className="text-sm text-gray-600">No tickets match this filter.</p>}
      </ul>
    </div>
  );
}
