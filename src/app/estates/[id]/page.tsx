import { notFound, redirect } from "next/navigation";
import { EstateNotFoundError, EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { CheckInButton } from "./check-in-button";
import { EditEstateForm } from "./edit-estate-form";

export default async function EstateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const service = new EstateService(new SupabaseEstateRepository(supabase));
  const estate = await service.getEstate(id).catch((error: unknown) => {
    if (error instanceof EstateNotFoundError) {
      notFound();
    }
    throw error;
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold">{estate.displayName}</h1>
      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-gray-600">Status</dt>
        <dd>{estate.status}</dd>
        <dt className="text-gray-600">Check-in interval</dt>
        <dd>{estate.checkInIntervalDays} days</dd>
        <dt className="text-gray-600">Grace period</dt>
        <dd>{estate.gracePeriodDays} days</dd>
        <dt className="text-gray-600">Last check-in</dt>
        <dd>{new Date(estate.lastCheckInAt).toLocaleString()}</dd>
      </dl>

      <div className="mt-6">
        <CheckInButton estateId={estate.id} />
      </div>

      <div className="mt-10 border-t border-gray-200 pt-6">
        <h2 className="mb-4 text-lg font-medium">Edit estate</h2>
        <EditEstateForm estate={estate} />
      </div>
    </main>
  );
}
