import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportTicket, SupportTicketRepository } from "@/domain/admin-support-tickets/ports";
import { POST } from "./route";

const getServerEnvMock = vi.fn();
vi.mock("@/config/env", () => ({
  getServerEnv: () => getServerEnvMock(),
}));

vi.mock("@/infrastructure/supabase/service-role-client", () => ({
  createSupabaseServiceRoleClient: vi.fn().mockReturnValue({}),
}));

let fakeRepository: SupportTicketRepository;
vi.mock("@/infrastructure/admin-support-tickets/supabase-support-ticket-repository", () => ({
  SupabaseSupportTicketRepository: vi.fn().mockImplementation(function SupabaseSupportTicketRepository() {
    return fakeRepository;
  }),
}));

function makeTicket(overrides: Partial<SupportTicket> = {}): SupportTicket {
  return {
    id: "ticket-1",
    fromEmail: "marcus@example.com",
    subject: "Can't unlock my vault",
    body: "Help!",
    status: "open",
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
    ...overrides,
  };
}

function webhookRequest(payload: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/webhooks/resend-inbound", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = { createTicket: vi.fn().mockResolvedValue(makeTicket()), listTickets: vi.fn(), updateTicket: vi.fn() };
  getServerEnvMock.mockReturnValue({ RESEND_INBOUND_WEBHOOK_SECRET: undefined });
});

describe("POST /api/webhooks/resend-inbound", () => {
  it("returns 401 when a webhook secret is configured but the request doesn't provide it", async () => {
    getServerEnvMock.mockReturnValue({ RESEND_INBOUND_WEBHOOK_SECRET: "shh" });

    const response = await POST(
      webhookRequest({ data: { from: "marcus@example.com", subject: "Help", text: "Details" } }),
    );

    expect(response.status).toBe(401);
    expect(fakeRepository.createTicket).not.toHaveBeenCalled();
  });

  it("accepts the request when the correct webhook secret is provided", async () => {
    getServerEnvMock.mockReturnValue({ RESEND_INBOUND_WEBHOOK_SECRET: "shh" });

    const response = await POST(
      webhookRequest(
        { data: { from: "marcus@example.com", subject: "Help", text: "Details" } },
        { "x-webhook-secret": "shh" },
      ),
    );

    expect(response.status).toBe(201);
  });

  it("returns 400 when the payload has no data field", async () => {
    const response = await POST(webhookRequest({ type: "email.received" }));
    expect(response.status).toBe(400);
    expect(fakeRepository.createTicket).not.toHaveBeenCalled();
  });

  it("creates a ticket from from/subject/text, falling back to html when text is absent", async () => {
    const response = await POST(
      webhookRequest({ data: { from: "marcus@example.com", subject: "Help", html: "<p>Details</p>" } }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.ticket).toEqual(makeTicket());
    expect(fakeRepository.createTicket).toHaveBeenCalledWith({
      fromEmail: "marcus@example.com",
      subject: "Help",
      body: "<p>Details</p>",
    });
  });
});
