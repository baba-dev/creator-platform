import { describe, expect, it, vi } from "vitest";

import {
  BYTEPLUS_MEDIAKIT_TOOLS,
  bytePlusMediaKitClientToken,
  createBytePlusMediaKitProvider,
} from "../src/byteplus/mediakit";
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("BytePlus MediaKit adapter", () => {
  it("publishes a unique allow-listed tool registry", () => {
    const ids = BYTEPLUS_MEDIAKIT_TOOLS.map((tool) => tool.id);
    const endpoints = BYTEPLUS_MEDIAKIT_TOOLS.map((tool) => tool.endpoint);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(endpoints).size).toBe(endpoints.length);
    expect(
      BYTEPLUS_MEDIAKIT_TOOLS.every((tool) =>
        tool.endpoint.startsWith("/api/v1/"),
      ),
    ).toBe(true);
  });

  it("derives stable provider idempotency tokens within the 64-byte limit", () => {
    const first = bytePlusMediaKitClientToken("request-1234567890abcdef");
    const second = bytePlusMediaKitClientToken("request-1234567890abcdef");
    expect(first).toBe(second);
    expect(first.length).toBeLessThanOrEqual(64);
  });

  it("injects client_token and normalizes async submission", async () => {
    const fetch = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        expect(body.client_token).toMatch(/^aiwa_[a-f0-9]+$/);
        return jsonResponse({
          success: true,
          task_id: "amk-tool-lip-sync-123",
          request_id: "req-1",
        });
      },
    );
    const provider = createBytePlusMediaKitProvider({
      apiKey: "test-key",
      fetch: fetch as typeof globalThis.fetch,
    });
    const result = await provider.submit({
      idempotencyKey: "request-1234567890abcdef",
      toolId: "lip-sync",
      input: {
        video_url: "https://example.com/video.mp4",
        audio_url: "https://example.com/audio.mp3",
      },
    });
    expect(result).toEqual({
      providerTaskId: "amk-tool-lip-sync-123",
      providerRequestId: "req-1",
      status: "submitted",
    });
  });

  it("prevents callers from overriding durability fields", async () => {
    const provider = createBytePlusMediaKitProvider({
      apiKey: "test-key",
      fetch: vi.fn() as unknown as typeof globalThis.fetch,
    });
    await expect(
      provider.submit({
        idempotencyKey: "request-1234567890abcdef",
        toolId: "lip-sync",
        input: { client_token: "attacker-controlled" },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_TOOL_INPUT",
      retryable: false,
    });
  });

  it("normalizes task polling", async () => {
    const provider = createBytePlusMediaKitProvider({
      apiKey: "test-key",
      fetch: vi.fn(async () =>
        jsonResponse({
          success: true,
          task_id: "amk-tool-lip-sync-123",
          request_id: "req-2",
          status: "completed",
          result: { video_url: "https://example.com/out.mp4", duration: 12.5 },
        }),
      ) as unknown as typeof globalThis.fetch,
    });
    const result = await provider.getTask("amk-tool-lip-sync-123");
    expect(result.status).toBe("succeeded");
    expect(result.result).toMatchObject({ duration: 12.5 });
  });

  it("marks throttling as retryable without exposing response details", async () => {
    const provider = createBytePlusMediaKitProvider({
      apiKey: "test-key",
      fetch: vi.fn(async () =>
        jsonResponse(
          {
            error: {
              code: "TooManyRequests",
              message: "secret-ish upstream detail",
            },
          },
          429,
        ),
      ) as unknown as typeof globalThis.fetch,
    });
    await expect(provider.getTask("task-1")).rejects.toMatchObject({
      code: "TooManyRequests",
      retryable: true,
      message: "MediaKit request failed",
    });
  });
});
