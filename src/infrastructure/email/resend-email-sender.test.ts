import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResendEmailSender } from "./resend-email-sender";

const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function Resend() {
    return { emails: { send: sendMock } };
  }),
}));

const input = {
  toEmail: "marcus@example.com",
  estateDisplayName: "Diane's Estate",
  role: "executor" as const,
  inviteUrl: "https://example.com/invites/abc123",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ResendEmailSender.sendNominationInviteEmail", () => {
  it("skips sending (returns false) when no API key is configured, without throwing", async () => {
    const sender = new ResendEmailSender(undefined);
    await expect(sender.sendNominationInviteEmail(input)).resolves.toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends via Resend with the rendered template when an API key is configured", async () => {
    sendMock.mockResolvedValue({ data: { id: "email-1" }, error: null });
    const sender = new ResendEmailSender("test-api-key", "AfterVault <test@example.com>");

    const result = await sender.sendNominationInviteEmail(input);

    expect(result).toBe(true);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "AfterVault <test@example.com>",
        to: "marcus@example.com",
        subject: expect.stringContaining("Executor"),
        html: expect.stringContaining("https://example.com/invites/abc123"),
        text: expect.stringContaining("https://example.com/invites/abc123"),
      }),
    );
  });

  it("returns false (does not throw) when Resend returns an error", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "invalid api key" } });
    const sender = new ResendEmailSender("test-api-key");

    await expect(sender.sendNominationInviteEmail(input)).resolves.toBe(false);
  });

  it("returns false (does not throw) when the Resend call itself throws", async () => {
    sendMock.mockRejectedValue(new Error("network error"));
    const sender = new ResendEmailSender("test-api-key");

    await expect(sender.sendNominationInviteEmail(input)).resolves.toBe(false);
  });
});
