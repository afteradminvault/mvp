import { NextResponse } from "next/server";
import { AdminSupportTicketService } from "@/domain/admin-support-tickets/admin-support-ticket-service";
import { SupabaseSupportTicketRepository } from "@/infrastructure/admin-support-tickets/supabase-support-ticket-repository";
import { adminErrorResponse } from "@/app/api/_lib/admin-error-response";
import { createSupabaseServiceRoleClient } from "@/infrastructure/supabase/service-role-client";
import { getServerEnv } from "@/config/env";

/**
 * US-8.6 🔒 — inbound email -> support_tickets row, per your "Resend
 * inbound" choice. No admin session exists for an external webhook call,
 * so this uses the service-role client directly (bypasses RLS, same
 * pattern as the cron sweep functions) rather than requirePlatformAdmin().
 *
 * Two things flagged rather than guessed at, since I can't verify Resend's
 * current inbound-webhook contract from here:
 *  1. Payload shape below (`data.from`/`data.subject`/`data.text`) is a
 *     best-effort guess matching Resend's other webhook events' general
 *     `{ type, data }` envelope — verify against the actual payload once
 *     inbound routing is configured in the Resend dashboard, and adjust
 *     the three field reads below if the real shape differs.
 *  2. Auth is a shared-secret header check (RESEND_INBOUND_WEBHOOK_SECRET),
 *     not full Svix signature verification (Resend webhooks are Svix-signed)
 *     — a real signature check is the stronger option but needs the svix
 *     package and its verification API, which isn't installed; adding it
 *     is a reasonable follow-up once the dashboard side is configured and
 *     the actual signing secret is available to test against.
 */
export async function POST(request: Request) {
  const serverEnv = getServerEnv();
  if (serverEnv.RESEND_INBOUND_WEBHOOK_SECRET) {
    const providedSecret = request.headers.get("x-webhook-secret");
    if (providedSecret !== serverEnv.RESEND_INBOUND_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Invalid webhook secret." }, { status: 401 });
    }
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const data = (payload as Record<string, unknown>).data as Record<string, unknown> | undefined;
  if (!data) {
    return NextResponse.json({ error: "Missing data payload." }, { status: 400 });
  }

  const service = new AdminSupportTicketService(
    new SupabaseSupportTicketRepository(createSupabaseServiceRoleClient()),
  );
  try {
    const ticket = await service.createTicket({
      fromEmail: data.from,
      subject: data.subject,
      body: data.text ?? data.html,
    });
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
