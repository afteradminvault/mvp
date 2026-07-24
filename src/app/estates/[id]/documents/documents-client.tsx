"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Document, DocumentType } from "@/domain/documents/ports";
import type { EstateStatus } from "@/domain/estates/ports";

const DOCUMENT_TYPES: DocumentType[] = [
  "death_certificate",
  "letters_testamentary",
  "letters_of_administration",
  "small_estate_affidavit",
  "executor_government_id",
  "notarized_affidavit",
  "other",
];

export function DocumentsClient({
  estateId,
  estateStatus,
  initialDocuments,
}: {
  estateId: string;
  estateStatus: EstateStatus;
  initialDocuments: Document[];
}) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [documentType, setDocumentType] = useState<DocumentType>("death_certificate");
  const [notes, setNotes] = useState("");
  const [isCertifiedOriginal, setIsCertifiedOriginal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

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
      formData.append("documentType", documentType);
      formData.append("isCertifiedOriginal", String(isCertifiedOriginal));
      if (notes) formData.append("notes", notes);

      const response = await fetch(`/api/estates/${estateId}/documents`, { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }

      setDocuments((current) => [result.document, ...current]);
      form.reset();
      setNotes("");
      setIsCertifiedOriginal(false);

      if (result.activatedEstate) {
        setNotice("This certificate satisfied the death-certificate requirement — executor access is now active.");
        router.refresh();
      }
    });
  }

  function handleDownload(documentId: string) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/estates/${estateId}/documents/${documentId}`);
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
    });
  }

  function handleDelete(documentId: string) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/estates/${estateId}/documents/${documentId}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json();
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setDocuments((current) => current.filter((doc) => doc.id !== documentId));
    });
  }

  function handleActivate() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const response = await fetch(`/api/estates/${estateId}/activate-executor`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setNotice("Executor access is now active.");
      router.refresh();
    });
  }

  const hasDeathCertificate = documents.some((doc) => doc.documentType === "death_certificate");

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      {estateStatus === "awaiting_death_certificate" && hasDeathCertificate && (
        <div className="rounded border border-yellow-400 bg-yellow-50 p-4">
          <p className="text-sm text-yellow-900">
            A death certificate is on file, but executor access hasn&apos;t been activated yet.
          </p>
          <button
            onClick={handleActivate}
            disabled={isPending}
            className="mt-3 rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {isPending ? "Activating..." : "Activate executor access"}
          </button>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {documents.map((doc) => (
          <li key={doc.id} className="rounded border border-gray-300 p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {doc.fileName} <span className="font-normal text-gray-600">&middot; {doc.documentType}</span>
                </p>
                <p className="text-gray-600">
                  {(doc.fileSizeBytes / 1024).toFixed(0)} KB &middot; uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                  {doc.isCertifiedOriginal ? " · certified original" : ""}
                </p>
                {doc.notes && <p className="mt-1 text-gray-600">{doc.notes}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => handleDownload(doc.id)} disabled={isPending} className="text-sm underline">
                  Download
                </button>
                <button
                  onClick={() => handleDelete(doc.id)}
                  disabled={isPending}
                  className="text-sm text-red-600 underline"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
        {documents.length === 0 && <p className="text-sm text-gray-600">No documents uploaded yet.</p>}
      </ul>

      <form onSubmit={handleUpload} className="flex flex-col gap-3 border-t border-gray-200 pt-4">
        <h2 className="text-sm font-medium">Upload a document</h2>
        <select
          value={documentType}
          onChange={(event) => setDocumentType(event.target.value as DocumentType)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
        >
          {DOCUMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.webp" className="text-sm" />
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isCertifiedOriginal}
            onChange={(event) => setIsCertifiedOriginal(event.target.checked)}
          />
          This is a certified original (not a scan/copy)
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {isPending ? "Uploading..." : "Upload"}
        </button>
      </form>
    </div>
  );
}
