import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EstateNotFoundError, EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { NotificationLetterService } from "@/domain/notification-letters/notification-letter-service";
import { SupabaseNotificationLetterRepository } from "@/infrastructure/notification-letters/supabase-notification-letter-repository";
import { SupabasePlatformRepository } from "@/infrastructure/platforms/supabase-platform-repository";
import { SupabaseDocumentRepository } from "@/infrastructure/documents/supabase-document-repository";
import { ResendEmailSender } from "@/infrastructure/email/resend-email-sender";
import { getServerEnv } from "@/config/env";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";

/** US-6.6 — every notification letter for this Case, with sent_via/sent_at doubling as the log. */
export default async function NotificationLettersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const estateService = new EstateService(new SupabaseEstateRepository(supabase));
  const estate = await estateService.getEstate(id).catch((error: unknown) => {
    if (error instanceof EstateNotFoundError) {
      notFound();
    }
    throw error;
  });

  const serverEnv = getServerEnv();
  const letterService = new NotificationLetterService(
    new SupabaseNotificationLetterRepository(supabase),
    new SupabaseEstateRepository(supabase),
    new SupabasePlatformRepository(supabase),
    new SupabaseDocumentRepository(supabase),
    new ResendEmailSender(serverEnv.RESEND_API_KEY, serverEnv.RESEND_FROM_EMAIL),
  );
  const letters = await letterService.listLetters(id);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href={`/estates/${id}`} className="text-sm underline">
        &larr; {estate.displayName}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Notification letters</h1>

      {letters.length === 0 ? (
        <p className="text-sm text-gray-600">
          No letters generated yet. Browse the{" "}
          <Link href={`/estates/${id}/platforms`} className="underline">
            platform directory
          </Link>{" "}
          to start one.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {letters.map((letter) => (
            <li key={letter.id} className="rounded border border-gray-300 p-3 text-sm">
              <Link href={`/estates/${id}/notification-letters/${letter.id}`} className="font-medium underline">
                {letter.letterType === "memorialize" ? "Memorialize" : "Close"} letter
              </Link>
              <p className="text-gray-600">
                {letter.sentAt
                  ? `Sent via ${letter.sentVia} on ${new Date(letter.sentAt).toLocaleString()}`
                  : "Draft — not yet sent"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
