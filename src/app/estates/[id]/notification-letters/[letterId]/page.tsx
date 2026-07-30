import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { NotificationLetterNotFoundError, NotificationLetterService } from "@/domain/notification-letters/notification-letter-service";
import { SupabaseNotificationLetterRepository } from "@/infrastructure/notification-letters/supabase-notification-letter-repository";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { SupabasePlatformRepository } from "@/infrastructure/platforms/supabase-platform-repository";
import { SupabaseDocumentRepository } from "@/infrastructure/documents/supabase-document-repository";
import { ResendEmailSender } from "@/infrastructure/email/resend-email-sender";
import { getServerEnv } from "@/config/env";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { NotificationLetterEditor } from "./notification-letter-editor";

export default async function NotificationLetterPage({
  params,
}: {
  params: Promise<{ id: string; letterId: string }>;
}) {
  const { id, letterId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const serverEnv = getServerEnv();
  const platformRepository = new SupabasePlatformRepository(supabase);
  const letterService = new NotificationLetterService(
    new SupabaseNotificationLetterRepository(supabase),
    new SupabaseEstateRepository(supabase),
    platformRepository,
    new SupabaseDocumentRepository(supabase),
    new ResendEmailSender(serverEnv.RESEND_API_KEY, serverEnv.RESEND_FROM_EMAIL),
  );

  const letter = await letterService.getLetter(letterId).catch((error: unknown) => {
    if (error instanceof NotificationLetterNotFoundError) {
      notFound();
    }
    throw error;
  });
  const platform = await platformRepository.getPlatform(letter.platformId);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href={`/estates/${id}/notification-letters`} className="text-sm underline">
        &larr; Notification letters
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">
        {letter.letterType === "memorialize" ? "Memorialize" : "Close"} letter{platform ? ` — ${platform.name}` : ""}
      </h1>

      <NotificationLetterEditor
        estateId={id}
        letter={letter}
        canSendByEmail={Boolean(platform?.bereavementContactEmail)}
      />
    </main>
  );
}
