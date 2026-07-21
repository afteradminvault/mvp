import Link from "next/link";
import { redirect } from "next/navigation";
import { EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { MembershipService } from "@/domain/membership/membership-service";
import { SupabaseMembershipRepository } from "@/infrastructure/membership/supabase-membership-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { InviteMemberForm } from "./invite-member-form";
import { MemberRow } from "./member-row";

export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const estateService = new EstateService(new SupabaseEstateRepository(supabase));
  const estate = await estateService.getEstate(id);

  const service = new MembershipService(new SupabaseMembershipRepository(supabase));
  const members = await service.listMembers(id);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href={`/estates/${id}`} className="text-sm underline">
        &larr; {estate.displayName}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Executors &amp; Helpers</h1>

      {members.length === 0 ? (
        <p className="mb-6 text-sm text-gray-600">No one has been nominated yet.</p>
      ) : (
        <ul className="mb-8 flex flex-col gap-3">
          {members.map((member) => (
            <MemberRow key={member.id} estateId={id} member={member} />
          ))}
        </ul>
      )}

      <div className="border-t border-gray-200 pt-6">
        <h2 className="mb-4 text-lg font-medium">Nominate an Executor or Helper</h2>
        <InviteMemberForm estateId={id} />
      </div>
    </main>
  );
}
