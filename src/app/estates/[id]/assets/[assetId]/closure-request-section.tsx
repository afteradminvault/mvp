"use client";

import { useState, useTransition } from "react";

const STATUSES = [
  "not_started",
  "documents_gathered",
  "submitted",
  "in_progress",
  "resolved",
  "rejected",
  "needs_attention",
  "out_of_scope",
] as const;

interface SnapshotItem {
  id: string;
  requirementType: string;
  submissionChannel: string;
  submissionDetail: string | null;
  notes: string | null;
  pendingCounselReview: boolean;
}

interface ClosureRequest {
  id: string;
  status: string;
  legalRequirementSnapshot: SnapshotItem[];
}

interface DocumentSummary {
  id: string;
  fileName: string;
  documentType: string;
}

/**
 * Minimal per-asset closure-request panel (Milestone 2 feature 7). The
 * estate-wide filterable dashboard (PRD §4.5) is Milestone 3 — this is
 * scoped to what an Executor needs while working a single asset: start a
 * request, track its status, attach existing documents. Read-only for
 * Owner/Helper (GET is "Role: any" per API Specification §10, but only
 * the Executor can write — closure_requests_write_executor RLS).
 */
export function ClosureRequestSection({
  estateId,
  assetId,
  initialRequests,
  availableDocuments,
  isExecutor,
}: {
  estateId: string;
  assetId: string;
  initialRequests: ClosureRequest[];
  availableDocuments: DocumentSummary[];
  isExecutor: boolean;
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [selectedDocument, setSelectedDocument] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/estates/${estateId}/assets/${assetId}/closure-requests`, {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setRequests((current) => [result.closureRequest, ...current]);
    });
  }

  function handleStatusChange(requestId: string, status: string) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/estates/${estateId}/closure-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setRequests((current) => current.map((r) => (r.id === requestId ? result.closureRequest : r)));
    });
  }

  function handleAttach(requestId: string) {
    const documentId = selectedDocument[requestId];
    if (!documentId) return;
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/estates/${estateId}/closure-requests/${requestId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setRequests((current) => current.map((r) => (r.id === requestId ? result.closureRequest : r)));
    });
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-medium">Account closure</h2>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {requests.length === 0 && <p className="mb-4 text-sm text-gray-600">No closure request started yet.</p>}

      <ul className="mb-4 flex flex-col gap-3">
        {requests.map((request) => (
          <li key={request.id} className="rounded border border-gray-300 p-3 text-sm">
            {isExecutor ? (
              <select
                value={request.status}
                onChange={(event) => handleStatusChange(request.id, event.target.value)}
                disabled={isPending}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            ) : (
              <p className="font-medium">Status: {request.status}</p>
            )}

            {request.legalRequirementSnapshot.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 text-gray-600">
                {request.legalRequirementSnapshot.map((item) => (
                  <li key={item.id}>
                    {item.requirementType} &middot; {item.submissionChannel}
                    {item.submissionDetail ? ` — ${item.submissionDetail}` : ""}
                    {item.pendingCounselReview && (
                      <span className="ml-1 rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-900">
                        🚩 pending counsel review
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {isExecutor && availableDocuments.length > 0 && (
              <div className="mt-3 flex items-center gap-2 border-t border-gray-200 pt-3">
                <select
                  value={selectedDocument[request.id] ?? ""}
                  onChange={(event) =>
                    setSelectedDocument((current) => ({ ...current, [request.id]: event.target.value }))
                  }
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                >
                  <option value="">Attach an existing document...</option>
                  {availableDocuments.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.fileName} ({doc.documentType})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleAttach(request.id)}
                  disabled={isPending || !selectedDocument[request.id]}
                  className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-50"
                >
                  Attach
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {isExecutor && (
        <button
          onClick={handleCreate}
          disabled={isPending}
          className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {isPending ? "Starting..." : "Start a closure request"}
        </button>
      )}
    </div>
  );
}
