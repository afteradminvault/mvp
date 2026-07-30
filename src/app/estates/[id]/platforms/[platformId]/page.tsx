import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PlatformNotFoundError, PlatformService } from "@/domain/platforms/platform-service";
import { SupabasePlatformRepository } from "@/infrastructure/platforms/supabase-platform-repository";
import { MembershipService } from "@/domain/membership/membership-service";
import { SupabaseMembershipRepository } from "@/infrastructure/membership/supabase-membership-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { GenerateNotificationLetterForm } from "./generate-notification-letter-form";

const CLOSURE_METHOD_LABELS: Record<string, string> = {
  online_form: "Online form",
  email: "Email",
  phone: "Phone",
  automatic: "Automatic (no action needed)",
};

/** US-5.2 — step-by-step closure instructions, closure method, and bereavement contact info for one platform. */
export default async function PlatformDetailPage({
  params,
}: {
  params: Promise<{ id: string; platformId: string }>;
}) {
  const { id, platformId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const platformService = new PlatformService(new SupabasePlatformRepository(supabase));
  const platform = await platformService.getPlatform(platformId).catch((error: unknown) => {
    if (error instanceof PlatformNotFoundError) {
      notFound();
    }
    throw error;
  });

  const membershipService = new MembershipService(new SupabaseMembershipRepository(supabase));
  const members = await membershipService.listMembers(id);
  const isFamilyViewer = members.some((member) => member.userId === user.id && member.role === "family");

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href={`/estates/${id}/platforms`} className="text-sm underline">
        &larr; Platform directory
      </Link>
      <h1 className="mt-2 mb-1 text-2xl font-semibold">{platform.name}</h1>
      <p className="mb-6 text-sm text-gray-600">{platform.defaultCategory}</p>

      {platform.closureMethod && (
        <p className="mb-4 inline-block rounded bg-gray-100 px-2 py-1 text-sm">
          Closure method: {CLOSURE_METHOD_LABELS[platform.closureMethod] ?? platform.closureMethod}
        </p>
      )}

      <div className="mb-6">
        <h2 className="mb-2 text-sm font-medium text-gray-700">Closure instructions</h2>
        {platform.closureInstructions ? (
          <p className="whitespace-pre-wrap text-sm">{platform.closureInstructions}</p>
        ) : (
          <p className="text-sm text-gray-600">No step-by-step instructions on file for this platform yet.</p>
        )}
      </div>

      {(platform.bereavementContactEmail || platform.bereavementContactPhone || platform.bereavementInstructionsUrl) && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-gray-700">Bereavement contact</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {platform.bereavementContactEmail && <li>Email: {platform.bereavementContactEmail}</li>}
            {platform.bereavementContactPhone && <li>Phone: {platform.bereavementContactPhone}</li>}
            {platform.bereavementInstructionsUrl && (
              <li>
                <a href={platform.bereavementInstructionsUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  Bereavement instructions
                </a>
              </li>
            )}
          </ul>
        </div>
      )}

      {platform.websiteUrl && (
        <a href={platform.websiteUrl} target="_blank" rel="noopener noreferrer" className="mb-6 block text-sm underline">
          Visit {platform.name} &rarr;
        </a>
      )}

      {isFamilyViewer && (
        <div className="mt-6">
          <GenerateNotificationLetterForm
            estateId={id}
            platformId={platform.id}
            supportsMemorialize={platform.supportsMemorialize}
          />
        </div>
      )}
    </main>
  );
}
