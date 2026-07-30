"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function CertificateForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  function advance() {
    startTransition(async () => {
      const response = await fetch(`/api/cases/${caseId}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftStep: "confirm", draftPayload: { certificateUploaded: uploaded } }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.push(`/cases/${caseId}/onboarding/confirm`);
      router.refresh();
    });
  }

  function handleUpload(event: FormEvent<HTMLFormElement>) {
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
      formData.append("documentType", "death_certificate");
      formData.append("isCertifiedOriginal", "false");

      const response = await fetch(`/api/estates/${caseId}/documents`, { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setUploaded(true);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleUpload} className="flex flex-col gap-3">
        <input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.webp" className="text-sm" />
        <button
          type="submit"
          disabled={isPending || uploaded}
          className="w-fit rounded border border-black px-4 py-2 text-sm disabled:opacity-50"
        >
          {uploaded ? "Uploaded" : isPending ? "Uploading..." : "Upload certificate"}
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={advance}
        disabled={isPending}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {isPending ? "Saving..." : uploaded ? "Continue" : "Skip for now"}
      </button>
    </div>
  );
}
