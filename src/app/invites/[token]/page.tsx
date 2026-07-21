import { InviteInvalidOrExpiredError, MembershipService } from "@/domain/membership/membership-service";
import { SupabaseMembershipRepository } from "@/infrastructure/membership/supabase-membership-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { AcceptInviteForm } from "./accept-invite-form";

export default async function InviteLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const service = new MembershipService(new SupabaseMembershipRepository(supabase));
  const preview = await service.getInvitePreview(token).catch((error: unknown) => {
    if (error instanceof InviteInvalidOrExpiredError) {
      return { estateDisplayName: "", role: "executor" as const, valid: false };
    }
    throw error;
  });

  if (!preview.valid) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 text-center">
        <h1 className="mb-2 text-2xl font-semibold">Invite not valid</h1>
        <p className="text-sm text-gray-600">
          This invitation link is invalid, has already been used, or has expired. Ask whoever sent it to send a
          new one.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-2 text-2xl font-semibold">You&apos;ve been invited</h1>
      <p className="mb-6 text-sm text-gray-600">
        You&apos;ve been nominated as <strong>{preview.role}</strong> for <strong>{preview.estateDisplayName}</strong>.
      </p>
      <AcceptInviteForm token={token} isLoggedIn={Boolean(user)} />
    </main>
  );
}
