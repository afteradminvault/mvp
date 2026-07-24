import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EstateNotFoundError, EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { MembershipService } from "@/domain/membership/membership-service";
import { SupabaseMembershipRepository } from "@/infrastructure/membership/supabase-membership-repository";
import {
  AuditLogService,
  DEFAULT_AUDIT_LOG_LIMIT,
  InvalidAuditLogQueryError,
  KNOWN_AUDIT_EVENT_TYPES,
} from "@/domain/audit-logs/audit-log-service";
import { SupabaseAuditLogRepository } from "@/infrastructure/audit-logs/supabase-audit-log-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";

/**
 * Estate-wide audit-log viewer (API Specification §13, Security
 * Architecture §3.3, Milestone 3 feature 3) — "surfacing what's already
 * being written since Milestone 0's RLS/audit design." Server-rendered
 * with query-param filters/pagination, same pattern as
 * /estates/[id]/closure-requests. Role: owner or executor per the API
 * spec — enforced by audit_logs_select_owner_or_executor RLS, but a Helper
 * landing here would just see an empty, confusing list rather than "you
 * don't have access," so this page also says so explicitly rather than
 * relying on RLS alone (unlike the "Role: any" resources elsewhere).
 */
export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ eventType?: string; from?: string; to?: string; offset?: string }>;
}) {
  const { id } = await params;
  const { eventType, from, to, offset: offsetParam } = await searchParams;
  const offset = Number(offsetParam ?? 0) || 0;

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

  const membershipService = new MembershipService(new SupabaseMembershipRepository(supabase));
  const members = await membershipService.listMembers(id);
  const viewerRole = members.find((member) => member.userId === user.id)?.role ?? null;
  const canView = viewerRole === "owner" || viewerRole === "executor";
  const emailByUserId = new Map(
    members.filter((member) => member.userId).map((member) => [member.userId as string, member.inviteEmail]),
  );

  const auditLogService = new AuditLogService(new SupabaseAuditLogRepository(supabase));
  let result = { entries: [] as Awaited<ReturnType<typeof auditLogService.listAuditLogs>>["entries"], total: 0 };
  let queryError: string | null = null;
  if (canView) {
    try {
      result = await auditLogService.listAuditLogs(id, { eventType, from, to, offset });
    } catch (error) {
      if (!(error instanceof InvalidAuditLogQueryError)) throw error;
      // A hand-edited URL (e.g. from is after to) rather than anything the form itself can produce — show it, don't 500.
      queryError = error.message;
    }
  }

  const limit = DEFAULT_AUDIT_LOG_LIMIT;
  const pageStart = result.total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + limit, result.total);
  const hasPrev = offset > 0;
  const hasNext = offset + limit < result.total;

  function hrefWithOffset(nextOffset: number) {
    const query = new URLSearchParams();
    if (eventType) query.set("eventType", eventType);
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    if (nextOffset > 0) query.set("offset", String(nextOffset));
    const queryString = query.toString();
    return `/estates/${id}/audit-log${queryString ? `?${queryString}` : ""}`;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-6">
        <Link href={`/estates/${id}`} className="text-sm underline">
          &larr; {estate.displayName}
        </Link>
        <h1 className="text-2xl font-semibold">Audit log</h1>
      </div>

      {!canView ? (
        <p className="text-sm text-gray-600">
          Audit log access is limited to the estate owner and executor.
        </p>
      ) : (
        <>
          <form method="get" className="mb-6 flex flex-wrap items-end gap-3 text-sm">
            <div className="flex flex-col gap-1">
              <label htmlFor="eventType" className="text-gray-600">
                Event type
              </label>
              <input
                id="eventType"
                name="eventType"
                list="known-event-types"
                defaultValue={eventType ?? ""}
                placeholder="e.g. vault_item_viewed"
                className="rounded border border-gray-300 px-2 py-1"
              />
              <datalist id="known-event-types">
                {KNOWN_AUDIT_EVENT_TYPES.map((type) => (
                  <option key={type} value={type} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="from" className="text-gray-600">
                From
              </label>
              <input
                id="from"
                type="date"
                name="from"
                defaultValue={from ?? ""}
                className="rounded border border-gray-300 px-2 py-1"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="to" className="text-gray-600">
                To
              </label>
              <input
                id="to"
                type="date"
                name="to"
                defaultValue={to ?? ""}
                className="rounded border border-gray-300 px-2 py-1"
              />
            </div>
            <button type="submit" className="rounded bg-black px-4 py-1.5 text-white">
              Filter
            </button>
            {(eventType || from || to) && (
              <Link href={`/estates/${id}/audit-log`} className="underline">
                Clear
              </Link>
            )}
          </form>

          {queryError && <p className="mb-4 text-sm text-red-600">{queryError}</p>}

          {result.entries.length === 0 ? (
            <p className="text-sm text-gray-600">No audit log entries match this filter.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {result.entries.map((entry) => {
                  const actorLabel = entry.actorUserId
                    ? (emailByUserId.get(entry.actorUserId) ?? `user ${entry.actorUserId.slice(0, 8)}`)
                    : "System";
                  return (
                    <li key={entry.id} className="rounded border border-gray-300 p-3 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">{entry.eventType}</span>
                        <span className="text-xs text-gray-500">{new Date(entry.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-gray-600">
                        {actorLabel}
                        {entry.targetTable && (
                          <>
                            {" "}
                            &middot; {entry.targetTable}
                            {entry.targetId ? ` (${entry.targetId.slice(0, 8)})` : ""}
                          </>
                        )}
                      </p>
                      {entry.metadata && (
                        <p className="mt-1 break-all text-xs text-gray-500">{JSON.stringify(entry.metadata)}</p>
                      )}
                    </li>
                  );
                })}
              </ul>

              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {pageStart}–{pageEnd} of {result.total}
                </span>
                <div className="flex gap-3">
                  {hasPrev ? (
                    <Link href={hrefWithOffset(Math.max(0, offset - limit))} className="underline">
                      &larr; Newer
                    </Link>
                  ) : (
                    <span className="text-gray-400">&larr; Newer</span>
                  )}
                  {hasNext ? (
                    <Link href={hrefWithOffset(offset + limit)} className="underline">
                      Older &rarr;
                    </Link>
                  ) : (
                    <span className="text-gray-400">Older &rarr;</span>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
