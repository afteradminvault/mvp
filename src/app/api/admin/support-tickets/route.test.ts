import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportTicket, SupportTicketRepository } from "@/domain/admin-support-tickets/ports";
import { GET, POST } from "./route";

const requirePlatformAdminMock = vi.fn();
vi.mock("@/app/api/_lib/require-platform-admin", () => ({
  requirePlatformAdmin: () => requirePlatformAdminMock(),
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

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/support-tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = {
    createTicket: vi.fn().mockResolvedValue(makeTicket()),
    listTickets: vi.fn().mockResolvedValue({ tickets: [], total: 0 }),
    updateTicket: vi.fn(),
  };
  requirePlatformAdminMock.mockResolvedValue({ supabase: {}, userId: "admin-1" });
});

describe("GET /api/admin/support-tickets", () => {
  it("returns 401 when the caller isn't an admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await GET(new Request("http://localhost/api/admin/support-tickets"));
    expect(response.status).toBe(403);
  });

  it("filters by status", async () => {
    await GET(new Request("http://localhost/api/admin/support-tickets?status=open"));

    expect(fakeRepository.listTickets).toHaveBeenCalledWith(expect.objectContaining({ status: "open" }));
  });
});

describe("POST /api/admin/support-tickets", () => {
  it("creates a ticket and returns 201", async () => {
    const response = await POST(
      postRequest({ fromEmail: "marcus@example.com", subject: "Help", body: "Details" }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.ticket).toEqual(makeTicket());
  });

  it("returns 400 for a malformed email", async () => {
    const response = await POST(postRequest({ fromEmail: "not-an-email", subject: "Help", body: "Details" }));
    expect(response.status).toBe(400);
  });
});
