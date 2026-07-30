import { NextResponse } from "next/server";
import { AdminSupportTicketService } from "@/domain/admin-support-tickets/admin-support-ticket-service";
import { SupabaseSupportTicketRepository } from "@/infrastructure/admin-support-tickets/supabase-support-ticket-repository";
import { requirePlatformAdmin } from "@/app/api/_lib/require-platform-admin";
import { adminErrorResponse } from "@/app/api/_lib/admin-error-response";

type RouteParams = { params: Promise<{ id: string }> };

/** US-8.6 — ticket status update (open/in_progress/resolved/closed). */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requirePlatformAdmin();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { status } = body as Record<string, unknown>;

  const service = new AdminSupportTicketService(new SupabaseSupportTicketRepository(session.supabase));
  try {
    const ticket = await service.updateTicket(id, { status });
    return NextResponse.json({ ticket });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
