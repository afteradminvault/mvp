/**
 * Support ticket domain contracts (Database Schema §2.11, PRD v2 §3.8,
 * US-8.6). Framework-free, same rationale as the other ports.ts files.
 */
export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";

export interface SupportTicket {
  id: string;
  fromEmail: string;
  subject: string;
  body: string;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupportTicketInput {
  fromEmail: string;
  subject: string;
  body: string;
}

export interface ListSupportTicketsFilter {
  status?: SupportTicketStatus;
  limit: number;
  offset: number;
}

export interface SupportTicketListResult {
  tickets: SupportTicket[];
  total: number;
}

export interface UpdateSupportTicketInput {
  status: SupportTicketStatus;
}

export interface SupportTicketRepository {
  /** Called from the inbound-email webhook (service-role client, no admin session — see the migration's own comment) as well as manual admin creation. */
  createTicket(input: CreateSupportTicketInput): Promise<SupportTicket>;
  listTickets(filter: ListSupportTicketsFilter): Promise<SupportTicketListResult>;
  updateTicket(ticketId: string, input: UpdateSupportTicketInput): Promise<SupportTicket>;
}
