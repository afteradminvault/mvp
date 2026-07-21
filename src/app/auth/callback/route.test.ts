import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const exchangeCodeForSessionMock = vi.fn();
vi.mock("@/infrastructure/supabase/server-client", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: { exchangeCodeForSession: (...args: unknown[]) => exchangeCodeForSessionMock(...args) },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /auth/callback", () => {
  it("exchanges a valid code for a session and redirects to /estates", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });

    const response = await GET(new Request("https://example.com/auth/callback?code=abc123"));

    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("abc123");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/estates");
  });

  it("redirects to /login if the exchange fails", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: new Error("invalid code") });

    const response = await GET(new Request("https://example.com/auth/callback?code=bad-code"));

    expect(response.headers.get("location")).toBe("https://example.com/login");
  });

  it("redirects to /login when no code is present", async () => {
    const response = await GET(new Request("https://example.com/auth/callback"));

    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://example.com/login");
  });
});
