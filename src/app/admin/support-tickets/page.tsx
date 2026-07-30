import Link from "next/link";
import { AdminSupportTicketService } from "@/domain/admin-support-tickets/admin-support-ticket-service";
import { SupabaseSupportTicketRepository } from "@/infrastructure/admin-support-tickets/supabase-support-ticket-repository";
import { requirePlatformAdminForPage } from "../require-platform-admin-page";
import { SupportTicketsClient } from "./support-tickets-client";

/** US-8.6 — the queue, filterable by status. Populated primarily via the inbound-email webhook (src/app/api/webhooks/resend-inbound). */
export default async function SupportTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const supabase = await requirePlatformAdminForPage();
  const { status } = await searchParams;

  const service = new AdminSupportTicketService(new SupabaseSupportTicketRepository(supabase));
  const result = await service.listTickets({ status });

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/admin" className="text-sm underline">
        &larr; Admin
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Support queue</h1>

      <div className="mb-4 flex gap-2 text-sm">
        <Link href="/admin/support-tickets" className={!status ? "font-semibold underline" : "underline"}>
          All
        </Link>
        {["open", "in_progress", "resolved", "closed"].map((s) => (
          <Link key={s} href={`/admin/support-tickets?status=${s}`} className={status === s ? "font-semibold underline" : "underline"}>
            {s.replace("_", " ")}
          </Link>
        ))}
      </div>

      <SupportTicketsClient initialTickets={result.tickets} />
    </main>
  );
}
