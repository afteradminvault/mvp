import { NextResponse } from "next/server";
import { ExecutorVerificationService } from "@/domain/executor-verification/executor-verification-service";
import { SupabaseExecutorVerificationRepository } from "@/infrastructure/executor-verification/supabase-executor-verification-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { executorVerificationErrorResponse } from "@/app/api/_lib/executor-verification-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string; memberId: string }> };

/**
 * US-4.2 🔒 — multipart upload into the same encrypted-at-rest `documents`
 * bucket used by src/domain/documents, not the zero-knowledge vault. The
 * upload_executor_id_document RPC (called by the repository) checks the
 * caller IS the nominated executor, so this route does no role check of
 * its own beyond requiring a session.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id, memberId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "A multipart/form-data body is required." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }
  const fileNameField = formData.get("fileName");
  const fileName = typeof fileNameField === "string" && fileNameField.length > 0 ? fileNameField : (file as File).name;
  const fileBytes = new Uint8Array(await file.arrayBuffer());

  const service = new ExecutorVerificationService(new SupabaseExecutorVerificationRepository(session.supabase));
  try {
    const verification = await service.uploadIdDocument(id, memberId, { fileName, mimeType: file.type, fileBytes });
    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "executor_id_document_uploaded",
      targetTable: "executor_verifications",
      targetId: verification.id,
    });
    return NextResponse.json({ verification }, { status: 201 });
  } catch (error) {
    return executorVerificationErrorResponse(error);
  }
}
