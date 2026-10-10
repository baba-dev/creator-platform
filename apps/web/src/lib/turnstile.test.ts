import { describe, expect, it, vi } from "vitest";
import { verifyTurnstileToken } from "./turnstile";

const input = {
  token: "valid-token",
  action: "signup" as const,
  secret: "server-only",
  hostname: "creator.aiwamediagroup.com",
};

function reply(data: unknown, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status === 200,
    json: async () => data,
  }) as unknown as typeof fetch;
}

describe("Turnstile Siteverify", () => {
  it("rejects absent and oversized tokens without contacting provider", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    expect(await verifyTurnstileToken({ ...input, token: "" }, fetcher)).toBe(
      false,
    );
    expect(
      await verifyTurnstileToken(
        { ...input, token: "a".repeat(2049) },
        fetcher,
      ),
    ).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires success, exact hostname and exact action", async () => {
    const good = { success: true, hostname: input.hostname, action: "signup" };
    const fetcher = reply(good);
    expect(await verifyTurnstileToken(input, fetcher)).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({ method: "POST", cache: "no-store" }),
    );
    const options = vi.mocked(fetcher).mock.calls[0]?.[1];
    expect(String(options?.body)).toContain("secret=server-only");
    for (const bad of [
      { ...good, success: false },
      { ...good, hostname: "attacker.example" },
      { ...good, action: "password_reset" },
      { ...good, action: undefined },
    ]) {
      expect(await verifyTurnstileToken(input, reply(bad))).toBe(false);
    }
  });

  it("fails closed on provider rejections and outages", async () => {
    expect(await verifyTurnstileToken(input, reply({}, 502))).toBe(false);
    expect(
      await verifyTurnstileToken(
        input,
        vi.fn().mockRejectedValue(new Error("offline")) as typeof fetch,
      ),
    ).toBe(false);
  });
});
