import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const getServerEnvMock = vi.fn();
vi.mock("@/config/env", () => ({
  getServerEnv: () => getServerEnvMock(),
}));

function requestWithAuth(header?: string): Request {
  return new Request("http://localhost/api/cron/placeholder", {
    headers: header ? { authorization: header } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/cron/placeholder", () => {
  it("allows the call through (with a warning) when CRON_SECRET isn't configured", async () => {
    getServerEnvMock.mockReturnValue({ CRON_SECRET: undefined });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await GET(requestWithAuth());
    expect(response.status).toBe(200);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET is configured but the header is missing or wrong", async () => {
    getServerEnvMock.mockReturnValue({ CRON_SECRET: "test-secret" });

    const response = await GET(requestWithAuth("Bearer wrong-secret"));
    expect(response.status).toBe(401);
  });

  it("returns 200 when CRON_SECRET matches the Authorization header", async () => {
    getServerEnvMock.mockReturnValue({ CRON_SECRET: "test-secret" });

    const response = await GET(requestWithAuth("Bearer test-secret"));
    expect(response.status).toBe(200);
  });
});
