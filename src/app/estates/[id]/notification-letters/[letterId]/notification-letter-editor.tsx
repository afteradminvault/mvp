"use client";

import { useState, useTransition } from "react";
import type { NotificationLetter, NotificationLetterSentVia } from "@/domain/notification-letters/ports";

/** US-6.3/6.4/6.5 — inline editing before finalization, then one of three equally-weighted finalize paths. */
export function NotificationLetterEditor({
  estateId,
  letter: initialLetter,
  canSendByEmail,
}: {
  estateId: string;
  letter: NotificationLetter;
  canSendByEmail: boolean;
}) {
  const [letter, setLetter] = useState(initialLetter);
  const [content, setContent] = useState(initialLetter.content);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isFinalized = letter.sentAt !== null;
  const isDirty = content !== letter.content;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/cases/${estateId}/notification-letters/${letter.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setLetter(result.letter);
    });
  }

  function handleFinalize(sentVia: NotificationLetterSentVia) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      if (isDirty) {
        const saveResponse = await fetch(`/api/cases/${estateId}/notification-letters/${letter.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        const saveResult = await saveResponse.json();
        if (!saveResponse.ok) {
          setError(saveResult.error ?? "Something went wrong saving your edits.");
          return;
        }
      }

      if (sentVia === "copy") {
        await navigator.clipboard.writeText(content);
      }

      const response = await fetch(`/api/cases/${estateId}/notification-letters/${letter.id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentVia }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setLetter(result.letter);
      setDownloadUrl(result.downloadUrl ?? null);
      if (sentVia === "email") setNotice("Sent to the platform's bereavement contact.");
      if (sentVia === "copy") setNotice("Copied to your clipboard.");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      {isFinalized ? (
        <div className="rounded border border-gray-300 bg-gray-50 p-4">
          <p className="mb-3 whitespace-pre-wrap text-sm">{letter.content}</p>
          <p className="text-xs text-gray-600">
            Sent via {letter.sentVia} on {letter.sentAt ? new Date(letter.sentAt).toLocaleString() : ""}
          </p>
          {downloadUrl && (
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm underline">
              Download PDF
            </a>
          )}
        </div>
      ) : (
        <>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={16}
            className="rounded border border-gray-300 p-3 text-sm"
          />
          <button
            onClick={handleSave}
            disabled={isPending || !isDirty}
            className="w-fit rounded border border-gray-300 px-4 py-2 text-sm disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save edits"}
          </button>

          <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4">
            <button
              onClick={() => handleFinalize("email")}
              disabled={isPending || !canSendByEmail}
              title={canSendByEmail ? undefined : "This platform has no bereavement contact email on file."}
              className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Send via email
            </button>
            <button
              onClick={() => handleFinalize("download")}
              disabled={isPending}
              className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Download PDF
            </button>
            <button
              onClick={() => handleFinalize("copy")}
              disabled={isPending}
              className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Copy to clipboard
            </button>
          </div>
        </>
      )}
    </div>
  );
}
