import { NextResponse } from "next/server";
import { AdminSupportTicketService } from "@/domain/admin-support-tickets/admin-support-ticket-service";
import { SupabaseSupportTicketRepository } from "@/infrastructure/admin-support-tickets/supabase-support-ticket-repository";
import { requirePlatformAdmin } from "@/app/api/_lib/require-platform-admin";
import { adminErrorResponse } from "@/app/api/_lib/admin-error-response";

/** US-8.6 — the queue, filterable by status (support_tickets_admin_all RLS scopes this to platform admins). */
export async function GET(request: Request) {
  const session = await requirePlatformAdmin();
  if ("unauthorized" in session) return session.unauthorized;

  const { searchParams } = new URL(request.url);
  const service = new AdminSupportTicketService(new SupabaseSupportTicketRepository(session.supabase));
  try {
    const result = await service.listTickets({
      status: searchParams.get("status") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return adminErrorResponse(error);
  }
}

/** Manual ticket creation by an admin — the primary creation path is the inbound-email webhook (src/app/api/webhooks/resend-inbound/route.ts). */
export async function POST(request: Request) {
  const session = await requirePlatformAdmin();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { fromEmail, subject, body: ticketBody } = body as Record<string, unknown>;

  const service = new AdminSupportTicketService(new SupabaseSupportTicketRepository(session.supabase));
  try {
    const ticket = await service.createTicket({ fromEmail, subject, body: ticketBody });
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
