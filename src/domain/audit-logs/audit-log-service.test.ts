import { describe, expect, it, vi } from "vitest";
import type { AuditLogEntry, AuditLogListResult, AuditLogRepository } from "./ports";
import { AuditLogService, InvalidAuditLogQueryError, MAX_AUDIT_LOG_LIMIT } from "./audit-log-service";

function createFakeRepository(overrides: Partial<AuditLogRepository> = {}): AuditLogRepository {
  return {
    listAuditLogs: vi.fn(),
    ...overrides,
  };
}

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: "log-1",
    estateId: "estate-1",
    actorUserId: "user-1",
    eventType: "vault_item_viewed",
    targetTable: "digital_vault_items",
    targetId: "item-1",
    metadata: null,
    ipAddress: null,
    createdAt: "2026-07-24T00:00:00.000Z",
    ...overrides,
  };
}

function makeResult(overrides: Partial<AuditLogListResult> = {}): AuditLogListResult {
  return {
    entries: [makeEntry()],
    total: 1,
    ...overrides,
  };
}

describe("AuditLogService.listAuditLogs", () => {
  it("applies default limit/offset when none are given", async () => {
    const repository = createFakeRepository({ listAuditLogs: vi.fn().mockResolvedValue(makeResult()) });
    const service = new AuditLogService(repository);

    await service.listAuditLogs("estate-1", {});

    expect(repository.listAuditLogs).toHaveBeenCalledWith("estate-1", {
      eventType: undefined,
      from: undefined,
      to: undefined,
      limit: 50,
      offset: 0,
    });
  });

  it("passes through eventType, from, to, limit, and offset", async () => {
    const repository = createFakeRepository({ listAuditLogs: vi.fn().mockResolvedValue(makeResult()) });
    const service = new AuditLogService(repository);

    await service.listAuditLogs("estate-1", {
      eventType: "vault_item_viewed",
      from: "2026-07-01",
      to: "2026-07-24",
      limit: "10",
      offset: "20",
    });

    expect(repository.listAuditLogs).toHaveBeenCalledWith("estate-1", {
      eventType: "vault_item_viewed",
      from: "2026-07-01",
      to: "2026-07-24",
      limit: 10,
      offset: 20,
    });
  });

  it("treats empty-string query params the same as omitted", async () => {
    const repository = createFakeRepository({ listAuditLogs: vi.fn().mockResolvedValue(makeResult()) });
    const service = new AuditLogService(repository);

    await service.listAuditLogs("estate-1", { eventType: "", from: "", to: "", limit: "", offset: "" });

    expect(repository.listAuditLogs).toHaveBeenCalledWith("estate-1", {
      eventType: undefined,
      from: undefined,
      to: undefined,
      limit: 50,
      offset: 0,
    });
  });

  it("returns the repository result unchanged", async () => {
    const result = makeResult({ total: 42 });
    const repository = createFakeRepository({ listAuditLogs: vi.fn().mockResolvedValue(result) });
    const service = new AuditLogService(repository);

    await expect(service.listAuditLogs("estate-1", {})).resolves.toBe(result);
  });

  it("rejects an invalid from date", async () => {
    const repository = createFakeRepository();
    const service = new AuditLogService(repository);

    await expect(service.listAuditLogs("estate-1", { from: "not-a-date" })).rejects.toThrow(
      InvalidAuditLogQueryError,
    );
    expect(repository.listAuditLogs).not.toHaveBeenCalled();
  });

  it("rejects an invalid to date", async () => {
    const repository = createFakeRepository();
    const service = new AuditLogService(repository);

    await expect(service.listAuditLogs("estate-1", { to: "not-a-date" })).rejects.toThrow(
      InvalidAuditLogQueryError,
    );
  });

  it("rejects when from is after to", async () => {
    const repository = createFakeRepository();
    const service = new AuditLogService(repository);

    await expect(
      service.listAuditLogs("estate-1", { from: "2026-07-24", to: "2026-07-01" }),
    ).rejects.toThrow(InvalidAuditLogQueryError);
    expect(repository.listAuditLogs).not.toHaveBeenCalled();
  });

  it("allows from equal to to", async () => {
    const repository = createFakeRepository({ listAuditLogs: vi.fn().mockResolvedValue(makeResult()) });
    const service = new AuditLogService(repository);

    await expect(
      service.listAuditLogs("estate-1", { from: "2026-07-24", to: "2026-07-24" }),
    ).resolves.toBeDefined();
  });

  it("rejects a non-integer limit", async () => {
    const repository = createFakeRepository();
    const service = new AuditLogService(repository);

    await expect(service.listAuditLogs("estate-1", { limit: "abc" })).rejects.toThrow(InvalidAuditLogQueryError);
  });

  it("rejects a limit below 1", async () => {
    const repository = createFakeRepository();
    const service = new AuditLogService(repository);

    await expect(service.listAuditLogs("estate-1", { limit: "0" })).rejects.toThrow(InvalidAuditLogQueryError);
  });

  it(`rejects a limit above ${MAX_AUDIT_LOG_LIMIT}`, async () => {
    const repository = createFakeRepository();
    const service = new AuditLogService(repository);

    await expect(
      service.listAuditLogs("estate-1", { limit: String(MAX_AUDIT_LOG_LIMIT + 1) }),
    ).rejects.toThrow(InvalidAuditLogQueryError);
  });

  it("rejects a negative offset", async () => {
    const repository = createFakeRepository();
    const service = new AuditLogService(repository);

    await expect(service.listAuditLogs("estate-1", { offset: "-1" })).rejects.toThrow(InvalidAuditLogQueryError);
  });

  it("rejects a non-integer offset", async () => {
    const repository = createFakeRepository();
    const service = new AuditLogService(repository);

    await expect(service.listAuditLogs("estate-1", { offset: "abc" })).rejects.toThrow(InvalidAuditLogQueryError);
  });
});
