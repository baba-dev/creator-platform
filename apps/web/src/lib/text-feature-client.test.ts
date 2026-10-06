import { afterEach, describe, expect, it, vi } from "vitest";

import { runQuotedTextFeature } from "./text-feature-client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("runQuotedTextFeature", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("does not submit a billable request when quote approval is declined", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        quote: {
          quoteToken: "signed",
          quotedModelId: "model",
          priceVersionId: "price",
          maximumChargeCredits: "12",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      runQuotedTextFeature(
        "/api/assistant/message",
        { content: "Hello" },
        { approveQuote: async () => false },
      ),
    ).rejects.toThrow("approval cancelled");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves idempotent POST replay for feature routes without a GET status resource", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          quote: {
            quoteToken: "quote-token",
            quotedModelId: "model-1",
            priceVersionId: "price-1",
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ pending: true }, 202))
      .mockResolvedValueOnce(jsonResponse({ value: "done" }, 201));
    vi.stubGlobal("fetch", fetchMock);

    const promise = runQuotedTextFeature<{ value: string }>(
      "/api/brand-profiles/generate",
      { organizationId: "org-1" },
      { idempotencyKey: "11111111-1111-4111-8111-111111111111", maxPolls: 2 },
    );
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ value: "done" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/brand-profiles/generate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses an explicit read-only GET status resource when the caller supplies one", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          quote: {
            quoteToken: "quote-token",
            quotedModelId: "model-1",
            priceVersionId: "price-1",
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ pending: true }, 202))
      .mockResolvedValueOnce(
        jsonResponse({ complete: true, message: { id: "assistant-1" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const key = "22222222-2222-4222-8222-222222222222";
    const promise = runQuotedTextFeature<{ complete: boolean }>(
      "/api/chat/threads/thread-1/messages",
      { content: "hello" },
      {
        idempotencyKey: key,
        maxPolls: 2,
        statusUrl: `/api/chat/threads/thread-1/messages?clientRequestId=${key}`,
      },
    );
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual(
      expect.objectContaining({ complete: true }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `/api/chat/threads/thread-1/messages?clientRequestId=${key}`,
      expect.objectContaining({ method: "GET" }),
    );
  });
});
