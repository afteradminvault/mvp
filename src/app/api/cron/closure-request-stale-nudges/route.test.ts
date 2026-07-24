import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const getServerEnvMock = vi.fn();
vi.mock("@/config/env", () => ({
  getServerEnv: () => getServerEnvMock(),
  clientEnv: { NEXT_PUBLIC_SITE_URL: "https://app.example.com" },
}));

const fakeSupabaseClient = { rpc: vi.fn() };
vi.mock("@/infrastructure/supabase/service-role-client", () => ({
  createSupabaseServiceRoleClient: vi.fn(() => fakeSupabaseClient),
}));

const sendNudgesMock = vi.fn();
vi.mock("@/domain/closure-requests/stale-request-nudge-service", () => ({
  StaleClosureRequestNudgeService: vi.fn().mockImplementation(function StaleClosureRequestNudgeService() {
    return { sendNudges: sendNudgesMock };
  }),
}));

function requestWithAuth(header?: string): Request {
  return new Request("http://localhost/api/cron/closure-request-stale-nudges", {
    headers: header ? { authorization: header } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerEnvMock.mockReturnValue({ CRON_SECRET: "test-secret" });
  sendNudgesMock.mockResolvedValue({ staleRequestCount: 0, emailsSent: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/cron/closure-request-stale-nudges", () => {
  it("returns 401 and never runs the sweep when the secret is wrong", async () => {
    const response = await GET(requestWithAuth("Bearer wrong-secret"));
    expect(response.status).toBe(401);
    expect(sendNudgesMock).not.toHaveBeenCalled();
  });

  it("runs the sweep with the site URL and reports counts when authorized", async () => {
    sendNudgesMock.mockResolvedValue({ staleRequestCount: 3, emailsSent: 2 });

    const response = await GET(requestWithAuth("Bearer test-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, staleRequestCount: 3, emailsSent: 2 });
    expect(sendNudgesMock).toHaveBeenCalledWith("https://app.example.com");
  });

  it("allows the call through (with a warning) when CRON_SECRET isn't configured", async () => {
    getServerEnvMock.mockReturnValue({ CRON_SECRET: undefined });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await GET(requestWithAuth());

    expect(response.status).toBe(200);
    expect(warnSpy).toHaveBeenCalled();
    expect(sendNudgesMock).toHaveBeenCalled();
  });
});
