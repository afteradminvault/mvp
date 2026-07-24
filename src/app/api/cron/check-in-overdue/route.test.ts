import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const getServerEnvMock = vi.fn();
vi.mock("@/config/env", () => ({
  getServerEnv: () => getServerEnvMock(),
  clientEnv: { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" },
}));

const fakeSupabaseClient = { rpc: vi.fn() };
vi.mock("@/infrastructure/supabase/service-role-client", () => ({
  createSupabaseServiceRoleClient: vi.fn(() => fakeSupabaseClient),
}));

const detectAndMarkOverdueEstatesMock = vi.fn();
vi.mock("@/infrastructure/dead-mans-switch/detect-overdue-estates", () => ({
  detectAndMarkOverdueEstates: (...args: unknown[]) => detectAndMarkOverdueEstatesMock(...args),
}));

function requestWithAuth(header?: string): Request {
  return new Request("http://localhost/api/cron/check-in-overdue", {
    headers: header ? { authorization: header } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerEnvMock.mockReturnValue({ CRON_SECRET: "test-secret" });
  detectAndMarkOverdueEstatesMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/cron/check-in-overdue", () => {
  it("returns 401 and runs no sweep when the secret is wrong", async () => {
    const response = await GET(requestWithAuth("Bearer wrong-secret"));
    expect(response.status).toBe(401);
    expect(detectAndMarkOverdueEstatesMock).not.toHaveBeenCalled();
  });

  it("runs the sweep and reports the count when authorized", async () => {
    detectAndMarkOverdueEstatesMock.mockResolvedValue([
      { id: "estate-1", lastCheckInAt: "2026-01-01T00:00:00Z", checkInIntervalDays: 90 },
    ]);

    const response = await GET(requestWithAuth("Bearer test-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, checkinOverdueCount: 1 });
    expect(detectAndMarkOverdueEstatesMock).toHaveBeenCalledWith(fakeSupabaseClient);
  });
});
