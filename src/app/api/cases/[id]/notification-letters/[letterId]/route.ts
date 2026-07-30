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

type RouteParams = { params: Promise<{ id: string; letterId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { letterId } = await params;
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
    const letter = await service.getLetter(letterId);
    return NextResponse.json({ letter });
  } catch (error) {
    return notificationLetterErrorResponse(error);
  }
}

/** US-6.3 — inline editing, refused once the letter has been finalized (NotificationLetterAlreadyFinalizedError -> 409). */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { letterId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { content } = body as Record<string, unknown>;

  const serverEnv = getServerEnv();
  const service = new NotificationLetterService(
    new SupabaseNotificationLetterRepository(session.supabase),
    new SupabaseEstateRepository(session.supabase),
    new SupabasePlatformRepository(session.supabase),
    new SupabaseDocumentRepository(session.supabase),
    new ResendEmailSender(serverEnv.RESEND_API_KEY, serverEnv.RESEND_FROM_EMAIL),
  );
  try {
    const letter = await service.updateContent(letterId, content);
    return NextResponse.json({ letter });
  } catch (error) {
    return notificationLetterErrorResponse(error);
  }
}
