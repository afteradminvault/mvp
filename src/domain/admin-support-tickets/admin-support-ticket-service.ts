import type {
  CreateSupportTicketInput,
  ListSupportTicketsFilter,
  SupportTicket,
  SupportTicketListResult,
  SupportTicketRepository,
  SupportTicketStatus,
} from "./ports";

export const SUPPORT_TICKET_STATUSES: readonly SupportTicketStatus[] = ["open", "in_progress", "resolved", "closed"];
export const DEFAULT_TICKET_LIMIT = 50;
export const MAX_TICKET_LIMIT = 100;
export const MAX_SUBJECT_LENGTH = 500;
export const MAX_BODY_LENGTH = 20000;

export class InvalidSupportTicketInputError extends Error {}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: unknown): string {
  if (typeof value !== "string" || !EMAIL_PATTERN.test(value.trim())) {
    throw new InvalidSupportTicketInputError("fromEmail must be a valid email address.");
  }
  return value.trim();
}

function validateNonEmptyString(value: unknown, fieldName: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidSupportTicketInputError(`${fieldName} is required.`);
  }
  if (value.length > maxLength) {
    throw new InvalidSupportTicketInputError(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return value;
}

function validateStatus(value: unknown): SupportTicketStatus {
  if (typeof value !== "string" || !SUPPORT_TICKET_STATUSES.includes(value as SupportTicketStatus)) {
    throw new InvalidSupportTicketInputError(`status must be one of: ${SUPPORT_TICKET_STATUSES.join(", ")}.`);
  }
  return value as SupportTicketStatus;
}

function validateLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") return DEFAULT_TICKET_LIMIT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_TICKET_LIMIT) {
    throw new InvalidSupportTicketInputError(`limit must be an integer between 1 and ${MAX_TICKET_LIMIT}.`);
  }
  return parsed;
}

function validateOffset(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InvalidSupportTicketInputError("offset must be a non-negative integer.");
  }
  return parsed;
}

/** Orchestrates the support queue (US-8.6). Real authorization for admin reads/writes is RLS-backed (support_tickets_admin_all); ticket creation from the inbound-email webhook is a separate, unauthenticated-by-design path (see the webhook route's own comment). */
export class AdminSupportTicketService {
  constructor(private readonly repository: SupportTicketRepository) {}

  async createTicket(input: { fromEmail: unknown; subject: unknown; body: unknown }): Promise<SupportTicket> {
    const fromEmail = validateEmail(input.fromEmail);
    const subject = validateNonEmptyString(input.subject, "subject", MAX_SUBJECT_LENGTH);
    const body = validateNonEmptyString(input.body, "body", MAX_BODY_LENGTH);
    const validInput: CreateSupportTicketInput = { fromEmail, subject, body };
    return this.repository.createTicket(validInput);
  }

  async listTickets(query: { status?: unknown; limit?: unknown; offset?: unknown }): Promise<SupportTicketListResult> {
    const filter: ListSupportTicketsFilter = {
      status: query.status !== undefined && query.status !== null && query.status !== "" ? validateStatus(query.status) : undefined,
      limit: validateLimit(query.limit),
      offset: validateOffset(query.offset),
    };
    return this.repository.listTickets(filter);
  }

  async updateTicket(ticketId: string, input: { status: unknown }): Promise<SupportTicket> {
    const status = validateStatus(input.status);
    return this.repository.updateTicket(ticketId, { status });
  }
}
