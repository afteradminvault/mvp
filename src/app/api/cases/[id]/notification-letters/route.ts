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

type RouteParams = { params: Promise<{ id: string }> };

/** US-6.6 — every letter for this Case, doubling as the notification log (sent_via/sent_at per row, no separate table). */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const serverEnv = getServerEnv();
  const service = new NotificationLetterService(
    new SupabaseNotificationLetterRepository(session.supabase),
    new SupabaseEstateRepository(session.supabase),
    new SupabasePlatformRepository(session.supabase),
    new SupabaseDocumentRepository(session.supabase),
    new ResendEmailSender(serverEnv.RESEND_API_KEY, serverEnv.RESEND_FROM_EMAIL),
  );
  try {
    const letters = await service.listLetters(id);
    return NextResponse.json({ letters });
  } catch (error) {
    return notificationLetterErrorResponse(error);
  }
}

/** US-6.1/6.2 — auto-fills from the case's deceased profile + platform template. */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { platformId, letterType } = body as Record<string, unknown>;

  const serverEnv = getServerEnv();
  const service = new NotificationLetterService(
    new SupabaseNotificationLetterRepository(session.supabase),
    new SupabaseEstateRepository(session.supabase),
    new SupabasePlatformRepository(session.supabase),
    new SupabaseDocumentRepository(session.supabase),
    new ResendEmailSender(serverEnv.RESEND_API_KEY, serverEnv.RESEND_FROM_EMAIL),
  );
  try {
    const letter = await service.generateLetter(id, session.userId, { platformId, letterType });
    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "notification_letter_generated",
      targetTable: "notification_letters",
      targetId: letter.id,
      metadata: { platformId: letter.platformId, letterType: letter.letterType },
    });
    return NextResponse.json({ letter }, { status: 201 });
  } catch (error) {
    return notificationLetterErrorResponse(error);
  }
}
