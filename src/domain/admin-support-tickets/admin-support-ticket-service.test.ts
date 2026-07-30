import { describe, expect, it, vi } from "vitest";
import type { SupportTicket, SupportTicketRepository } from "./ports";
import { AdminSupportTicketService, InvalidSupportTicketInputError } from "./admin-support-ticket-service";

function makeTicket(overrides: Partial<SupportTicket> = {}): SupportTicket {
  return {
    id: "ticket-1",
    fromEmail: "marcus@example.com",
    subject: "Can't unlock my vault",
    body: "I forgot my password, help!",
    status: "open",
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
    ...overrides,
  };
}

function createFakeRepository(overrides: Partial<SupportTicketRepository> = {}): SupportTicketRepository {
  return {
    createTicket: vi.fn().mockResolvedValue(makeTicket()),
    listTickets: vi.fn(),
    updateTicket: vi.fn(),
    ...overrides,
  };
}

describe("AdminSupportTicketService.createTicket", () => {
  it("creates a ticket with valid input", async () => {
    const repository = createFakeRepository();
    const service = new AdminSupportTicketService(repository);

    await service.createTicket({ fromEmail: "marcus@example.com", subject: "Help", body: "Details" });

    expect(repository.createTicket).toHaveBeenCalledWith({
      fromEmail: "marcus@example.com",
      subject: "Help",
      body: "Details",
    });
  });

  it("rejects a malformed fromEmail", async () => {
    const repository = createFakeRepository();
    const service = new AdminSupportTicketService(repository);

    await expect(
      service.createTicket({ fromEmail: "not-an-email", subject: "Help", body: "Details" }),
    ).rejects.toThrow(InvalidSupportTicketInputError);
    expect(repository.createTicket).not.toHaveBeenCalled();
  });

  it("rejects a blank subject", async () => {
    const repository = createFakeRepository();
    const service = new AdminSupportTicketService(repository);

    await expect(
      service.createTicket({ fromEmail: "marcus@example.com", subject: "  ", body: "Details" }),
    ).rejects.toThrow(InvalidSupportTicketInputError);
  });

  it("rejects a blank body", async () => {
    const repository = createFakeRepository();
    const service = new AdminSupportTicketService(repository);

    await expect(
      service.createTicket({ fromEmail: "marcus@example.com", subject: "Help", body: "" }),
    ).rejects.toThrow(InvalidSupportTicketInputError);
  });
});

describe("AdminSupportTicketService.listTickets", () => {
  it("applies default limit/offset when no filters are given", async () => {
    const repository = createFakeRepository({ listTickets: vi.fn().mockResolvedValue({ tickets: [], total: 0 }) });
    const service = new AdminSupportTicketService(repository);

    await service.listTickets({});

    expect(repository.listTickets).toHaveBeenCalledWith({ status: undefined, limit: 50, offset: 0 });
  });

  it("filters by status", async () => {
    const repository = createFakeRepository({ listTickets: vi.fn().mockResolvedValue({ tickets: [], total: 0 }) });
    const service = new AdminSupportTicketService(repository);

    await service.listTickets({ status: "open" });

    expect(repository.listTickets).toHaveBeenCalledWith(expect.objectContaining({ status: "open" }));
  });

  it("rejects an invalid status filter", async () => {
    const repository = createFakeRepository();
    const service = new AdminSupportTicketService(repository);

    await expect(service.listTickets({ status: "archived" })).rejects.toThrow(InvalidSupportTicketInputError);
  });
});

describe("AdminSupportTicketService.updateTicket", () => {
  it("updates the status", async () => {
    const updated = makeTicket({ status: "resolved" });
    const repository = createFakeRepository({ updateTicket: vi.fn().mockResolvedValue(updated) });
    const service = new AdminSupportTicketService(repository);

    const result = await service.updateTicket("ticket-1", { status: "resolved" });

    expect(repository.updateTicket).toHaveBeenCalledWith("ticket-1", { status: "resolved" });
    expect(result).toBe(updated);
  });

  it("rejects an invalid status", async () => {
    const repository = createFakeRepository();
    const service = new AdminSupportTicketService(repository);

    await expect(service.updateTicket("ticket-1", { status: "archived" })).rejects.toThrow(
      InvalidSupportTicketInputError,
    );
  });
});
