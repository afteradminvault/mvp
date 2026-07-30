import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateSupportTicketInput,
  ListSupportTicketsFilter,
  SupportTicket,
  SupportTicketListResult,
  SupportTicketRepository,
  SupportTicketStatus,
  UpdateSupportTicketInput,
} from "@/domain/admin-support-tickets/ports";

interface SupportTicketRow {
  id: string;
  from_email: string;
  subject: string;
  body: string;
  status: SupportTicketStatus;
  created_at: string;
  updated_at: string;
}

function toSupportTicket(row: SupportTicketRow): SupportTicket {
  return {
    id: row.id,
    fromEmail: row.from_email,
    subject: row.subject,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Client-agnostic — the caller decides which client to pass in (the admin's own session for browsing/updating the queue, or the service-role client from the inbound-email webhook, which has no admin session to authenticate as). */
export class SupabaseSupportTicketRepository implements SupportTicketRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createTicket(input: CreateSupportTicketInput): Promise<SupportTicket> {
    const { data, error } = await this.supabase
      .from("support_tickets")
      .insert({ from_email: input.fromEmail, subject: input.subject, body: input.body })
      .select("*")
      .single();
    if (error) throw error;
    return toSupportTicket(data as SupportTicketRow);
  }

  async listTickets(filter: ListSupportTicketsFilter): Promise<SupportTicketListResult> {
    let query = this.supabase.from("support_tickets").select("*", { count: "exact" });
    if (filter.status) query = query.eq("status", filter.status);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(filter.offset, filter.offset + filter.limit - 1);
    if (error) throw error;
    return { tickets: (data as SupportTicketRow[]).map(toSupportTicket), total: count ?? 0 };
  }

  async updateTicket(ticketId: string, input: UpdateSupportTicketInput): Promise<SupportTicket> {
    const { data, error } = await this.supabase
      .from("support_tickets")
      .update({ status: input.status })
      .eq("id", ticketId)
      .select("*")
      .single();
    if (error) throw error;
    return toSupportTicket(data as SupportTicketRow);
  }
}
