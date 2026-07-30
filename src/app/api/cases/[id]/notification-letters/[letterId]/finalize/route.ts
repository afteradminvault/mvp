import { NextResponse } from "next/server";
import { NotificationLetterService } from "@/domain/notification-letters/notification-letter-service";
import { SupabaseNotificationLetterRepository } from "@/infrastructure/notification-letters/supabase-notification-letter-repository";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { SupabasePlatformRepository } from "@/infrastructure/platforms/supabase-platform-repository";
import { SupabaseDocumentRepository } from "@/infrastructure/documents/supabase-document-repository";
import { ResendEmailSender } from "@/infrastructure/email/resend-email-sender";
import { getServerEnv } from "@/config/env";
import { requireSession } from "@/app/api/_lib/require-session";
import { notificationLetterErrorResponse } from "@/app/api/_lib/notification-letter-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string; letterId: string }> };

/**
 * US-6.4/6.5 🔒 — the three equally-weighted finalization paths
 * (email/download/copy) converge on this one endpoint; sentVia is what
 * distinguishes them. A PDF is generated and stored via the `documents`
 * table on every path, and for "download" the response includes a signed
 * URL to it (same short-lived-signed-URL pattern as
 * src/app/api/estates/[id]/documents/[docId]) so the client has something
 * to actually download.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id, letterId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { sentVia } = body as Record<string, unknown>;

  const serverEnv = getServerEnv();
  const documentRepository = new SupabaseDocumentRepository(session.supabase);
  const service = new NotificationLetterService(
    new SupabaseNotificationLetterRepository(session.supabase),
    new SupabaseEstateRepository(session.supabase),
    new SupabasePlatformRepository(session.supabase),
    documentRepository,
    new ResendEmailSender(serverEnv.RESEND_API_KEY, serverEnv.RESEND_FROM_EMAIL),
  );
  try {
    const letter = await service.finalize(id, letterId, session.userId, sentVia);
    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "notification_letter_finalized",
      targetTable: "notification_letters",
      targetId: letter.id,
      metadata: { sentVia: letter.sentVia },
    });

    const downloadUrl = letter.pdfDocumentId
      ? await documentRepository.createSignedDownloadUrl(id, letter.pdfDocumentId)
      : null;

    return NextResponse.json({ letter, downloadUrl });
  } catch (error) {
    return notificationLetterErrorResponse(error);
  }
}
