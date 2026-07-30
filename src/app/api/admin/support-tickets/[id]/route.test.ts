import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportTicket, SupportTicketRepository } from "@/domain/admin-support-tickets/ports";
import { PATCH } from "./route";

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
    status: "resolved",
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T01:00:00.000Z",
    ...overrides,
  };
}

function routeParams(id = "ticket-1") {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/support-tickets/ticket-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeRepository = {
    createTicket: vi.fn(),
    listTickets: vi.fn(),
    updateTicket: vi.fn().mockResolvedValue(makeTicket()),
  };
  requirePlatformAdminMock.mockResolvedValue({ supabase: {}, userId: "admin-1" });
});

describe("PATCH /api/admin/support-tickets/:id", () => {
  it("returns 401 when the caller isn't an admin", async () => {
    requirePlatformAdminMock.mockResolvedValue({
      unauthorized: NextResponse.json({ error: "nope" }, { status: 403 }),
    });

    const response = await PATCH(patchRequest({ status: "resolved" }), routeParams());
    expect(response.status).toBe(403);
  });

  it("updates the ticket status", async () => {
    const response = await PATCH(patchRequest({ status: "resolved" }), routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ticket).toEqual(makeTicket());
    expect(fakeRepository.updateTicket).toHaveBeenCalledWith("ticket-1", { status: "resolved" });
  });

  it("returns 400 for an invalid status", async () => {
    const response = await PATCH(patchRequest({ status: "archived" }), routeParams());
    expect(response.status).toBe(400);
  });
});
