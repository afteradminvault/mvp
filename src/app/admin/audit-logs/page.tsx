import Link from "next/link";
import {
  AuditLogService,
  DEFAULT_AUDIT_LOG_LIMIT,
  InvalidAuditLogQueryError,
  KNOWN_AUDIT_EVENT_TYPES,
} from "@/domain/audit-logs/audit-log-service";
import { SupabaseAuditLogRepository } from "@/infrastructure/audit-logs/supabase-audit-log-repository";
import { requirePlatformAdminForPage } from "../require-platform-admin-page";

/**
 * US-8.7 — system-wide (not per-case) audit log, filterable by
 * event_type/actor/date range. Dense, serious/technical tone per the
 * story's own AC — same table layout as the per-case viewer
 * (src/app/estates/[id]/audit-log), but with no per-case member/email map
 * to resolve actor names against (this spans every Case), so actors are
 * shown as raw user ids.
 */
export default async function AdminAuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ eventType?: string; actorUserId?: string; from?: string; to?: string; offset?: string }>;
}) {
  const supabase = await requirePlatformAdminForPage();
  const { eventType, actorUserId, from, to, offset: offsetParam } = await searchParams;
  const offset = Number(offsetParam ?? 0) || 0;

  const auditLogService = new AuditLogService(new SupabaseAuditLogRepository(supabase));
  let result = { entries: [] as Awaited<ReturnType<typeof auditLogService.listAllAuditLogs>>["entries"], total: 0 };
  let queryError: string | null = null;
  try {
    result = await auditLogService.listAllAuditLogs({ eventType, actorUserId, from, to, offset });
  } catch (error) {
    if (!(error instanceof InvalidAuditLogQueryError)) throw error;
    queryError = error.message;
  }

  const limit = DEFAULT_AUDIT_LOG_LIMIT;
  const pageStart = result.total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + limit, result.total);
  const hasPrev = offset > 0;
  const hasNext = offset + limit < result.total;

  function hrefWithOffset(nextOffset: number) {
    const query = new URLSearchParams();
    if (eventType) query.set("eventType", eventType);
    if (actorUserId) query.set("actorUserId", actorUserId);
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    if (nextOffset > 0) query.set("offset", String(nextOffset));
    const queryString = query.toString();
    return `/admin/audit-logs${queryString ? `?${queryString}` : ""}`;
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 font-mono">
      <Link href="/admin" className="text-sm underline">
        &larr; Admin
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">System-wide audit log</h1>

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
            placeholder="e.g. admin_case_flagged"
            className="rounded border border-gray-300 px-2 py-1"
          />
          <datalist id="known-event-types">
            {KNOWN_AUDIT_EVENT_TYPES.map((type) => (
              <option key={type} value={type} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="actorUserId" className="text-gray-600">
            Actor user id
          </label>
          <input
            id="actorUserId"
            name="actorUserId"
            defaultValue={actorUserId ?? ""}
            placeholder="uuid"
            className="rounded border border-gray-300 px-2 py-1"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="from" className="text-gray-600">
            From
          </label>
          <input id="from" type="date" name="from" defaultValue={from ?? ""} className="rounded border border-gray-300 px-2 py-1" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="to" className="text-gray-600">
            To
          </label>
          <input id="to" type="date" name="to" defaultValue={to ?? ""} className="rounded border border-gray-300 px-2 py-1" />
        </div>
        <button type="submit" className="rounded bg-black px-4 py-1.5 text-white">
          Filter
        </button>
        {(eventType || actorUserId || from || to) && (
          <Link href="/admin/audit-logs" className="underline">
            Clear
          </Link>
        )}
      </form>

      {queryError && <p className="mb-4 text-sm text-red-600">{queryError}</p>}

      {result.entries.length === 0 ? (
        <p className="text-sm text-gray-600">No audit log entries match this filter.</p>
      ) : (
        <>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-300 text-left text-gray-600">
                <th className="py-1.5 pr-2">Time</th>
                <th className="py-1.5 pr-2">Event</th>
                <th className="py-1.5 pr-2">Actor</th>
                <th className="py-1.5 pr-2">Case</th>
                <th className="py-1.5 pr-2">Target</th>
              </tr>
            </thead>
            <tbody>
              {result.entries.map((entry) => (
                <tr key={entry.id} className="border-b border-gray-100">
                  <td className="py-1.5 pr-2 whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</td>
                  <td className="py-1.5 pr-2">{entry.eventType}</td>
                  <td className="py-1.5 pr-2">{entry.actorUserId ? entry.actorUserId.slice(0, 8) : "system"}</td>
                  <td className="py-1.5 pr-2">{entry.estateId ? entry.estateId.slice(0, 8) : "—"}</td>
                  <td className="py-1.5 pr-2">
                    {entry.targetTable ? `${entry.targetTable}${entry.targetId ? ` (${entry.targetId.slice(0, 8)})` : ""}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

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
    </main>
  );
}
