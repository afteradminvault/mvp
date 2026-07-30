import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EstateNotFoundError, EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { AssetService } from "@/domain/assets/asset-service";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { MembershipService } from "@/domain/membership/membership-service";
import { SupabaseMembershipRepository } from "@/infrastructure/membership/supabase-membership-repository";
import { ReadinessService } from "@/domain/readiness/readiness-service";
import { SupabaseReadinessRepository } from "@/infrastructure/readiness/supabase-readiness-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { CheckInButton } from "./check-in-button";
import { EditEstateForm } from "./edit-estate-form";
import { ReadinessCard } from "./readiness-card";
import { ReportDeathButton } from "./report-death-button";
import { SelfCancelBanner } from "./self-cancel-banner";
import { ExecutorVaultUnlock } from "./executor-vault-unlock";

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

  const assetService = new AssetService(new SupabaseDigitalAssetRepository(supabase));
  const membershipService = new MembershipService(new SupabaseMembershipRepository(supabase));
  const readinessService = new ReadinessService(new SupabaseReadinessRepository(supabase));

  const [assets, members, readinessScore] = await Promise.all([
    assetService.listAssets(id),
    membershipService.listMembers(id),
    readinessService.getReadinessScore(id),
  ]);

  const viewerRole = members.find((member) => member.userId === user.id)?.role ?? null;
  // isOwner keys off estate.ownerUserId directly, not viewerRole === "family"
  // — the two currently always coincide (there's no invite path onto a
  // second "family" row, per invite_member()'s own guard), but this
  // matches report_death()'s own authorization check (which the two lines
  // below mirror) rather than relying on that coincidence.
  const isOwner = estate.ownerUserId === user.id;
  const isExecutor = viewerRole === "executor";
  const canReportDeathAsOtherFamilyMember = viewerRole === "family" && !isOwner;
  const canReportDeath =
    (isExecutor || canReportDeathAsOtherFamilyMember) &&
    (estate.status === "active_living" || estate.status === "checkin_overdue");
  const canSelfCancel = isOwner && estate.status === "verifying";
  const canRecoverKey = isExecutor && estate.status === "active_executor";
  const verificationInProgress =
    (isExecutor || canReportDeathAsOtherFamilyMember) &&
    (estate.status === "death_reported" || estate.status === "verifying" || estate.status === "awaiting_death_certificate");

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
        <dt className="text-gray-600">Self-cancel window</dt>
        <dd>{estate.selfCancelWindowDays} days</dd>
      </dl>

      {verificationInProgress && (
        <p className="mt-6 rounded border border-yellow-400 bg-yellow-50 p-3 text-sm text-yellow-900">
          This estate is in the death-verification process (status: {estate.status}).
        </p>
      )}

      {canSelfCancel && (
        <div className="mt-6">
          <SelfCancelBanner
            estateId={estate.id}
            selfCancelWindowDays={estate.selfCancelWindowDays}
            verificationStartedAt={estate.verificationStartedAt}
          />
        </div>
      )}

      {canReportDeath && (
        <div className="mt-6">
          <ReportDeathButton estateId={estate.id} />
        </div>
      )}

      {canRecoverKey && (
        <div className="mt-6">
          <ExecutorVaultUnlock estateId={estate.id} />
        </div>
      )}

      <div className="mt-6 flex items-center gap-4">
        <CheckInButton estateId={estate.id} />
      </div>

      <div className="mt-8">
        <ReadinessCard score={readinessScore} />
      </div>

      <div className="mt-6 rounded border border-gray-300 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Digital assets</h2>
          <Link href={`/estates/${id}/assets`} className="text-sm underline">
            Manage &rarr;
          </Link>
        </div>
        {assets.length === 0 ? (
          <p className="text-sm text-gray-600">No assets added yet.</p>
        ) : (
          <>
            <p className="mb-2 text-sm text-gray-600">
              {assets.length} asset{assets.length === 1 ? "" : "s"}
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {assets.slice(0, 5).map((asset) => (
                <li key={asset.id}>
                  {asset.customProviderName ?? asset.providerId ?? "Unnamed asset"} &middot; {asset.category}
                </li>
              ))}
            </ul>
          </>
        )}
        <Link
          href={`/estates/${id}/assets`}
          className="mt-3 inline-block rounded bg-black px-3 py-1.5 text-sm text-white"
        >
          Manage your vault
        </Link>
      </div>

      <div className="mt-6 rounded border border-gray-300 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Documents</h2>
          <Link href={`/estates/${id}/documents`} className="text-sm underline">
            Manage &rarr;
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded border border-gray-300 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Account closures</h2>
          <Link href={`/estates/${id}/closure-requests`} className="text-sm underline">
            View dashboard &rarr;
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded border border-gray-300 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Platform directory</h2>
          <Link href={`/estates/${id}/platforms`} className="text-sm underline">
            Browse &rarr;
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded border border-gray-300 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Notification letters</h2>
          <Link href={`/estates/${id}/notification-letters`} className="text-sm underline">
            View &rarr;
          </Link>
        </div>
      </div>

      {estate.isSelfPlanned && isOwner && (
        <div className="mt-6 rounded border border-gray-300 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Your Will</h2>
            <Link href={`/estates/${id}/will`} className="text-sm underline">
              Manage &rarr;
            </Link>
          </div>
        </div>
      )}

      {(isOwner || isExecutor) && (
        <div className="mt-6 rounded border border-gray-300 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Audit log</h2>
            <Link href={`/estates/${id}/audit-log`} className="text-sm underline">
              View &rarr;
            </Link>
          </div>
        </div>
      )}

      <div className="mt-6 rounded border border-gray-300 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Vault preview letter</h2>
          <Link href={`/estates/${id}/vault-preview-letter`} className="text-sm underline">
            Generate &rarr;
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded border border-gray-300 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Executors &amp; Helpers</h2>
          <Link href={`/estates/${id}/members`} className="text-sm underline">
            Manage &rarr;
          </Link>
        </div>
        {members.length === 0 ? (
          <p className="text-sm text-gray-600">No one has been nominated yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {members.map((member) => (
              <li key={member.id}>
                {member.inviteEmail} &middot; {member.role} &middot; {member.inviteStatus}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-10 border-t border-gray-200 pt-6">
        <h2 className="mb-4 text-lg font-medium">Edit estate</h2>
        <EditEstateForm estate={estate} />
      </div>
    </main>
  );
}
