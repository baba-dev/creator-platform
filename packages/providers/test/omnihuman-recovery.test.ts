import { describe, expect, it, vi } from "vitest";
import {
  diagnoseOmniHumanVision,
  getOmniHumanVisionJob,
  cancelOmniHumanVisionJob,
  submitOmniHumanVisionTask,
} from "../src/byteplus/vision";
const response = (data: unknown, code = 10000) =>
  new Response(JSON.stringify({ code, data }));
const config = (fetch: typeof globalThis.fetch) => ({
  accessKeyId: "test-ak",
  secretAccessKey: "test-sk",
  requestTimeoutMs: 1000,
  fetch,
});
describe("OmniHuman diagnostics and recovery", () => {
  it("treats a malformed successful submit response as ambiguous rather than a rejection", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("not-json", { status: 200 }));
    await expect(
      submitOmniHumanVisionTask(config(fetch), {
        workflow: "TALKING_AVATAR",
        prompt: "",
        sources: [
          { role: "AVATAR_IMAGE", url: "https://example.com/portrait.jpg" },
          { role: "DRIVING_AUDIO", url: "https://example.com/speech.mp3" },
        ],
        resolution: "720p",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_PROVIDER_RESPONSE",
      retryable: true,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("reports missing credentials without a network call", async () => {
    const fetch = vi.fn();
    expect(
      await diagnoseOmniHumanVision({ requestTimeoutMs: 1000, fetch }),
    ).toMatchObject({ status: "missing_credentials" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("verifies a signed read without submitting paid work or exposing credentials", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ status: "not_found" }));
    const result = await diagnoseOmniHumanVision(config(fetch));
    expect(result).toMatchObject({
      status: "verified",
      region: "ap-singapore-1",
      service: "cv",
    });
    expect(JSON.stringify(result)).not.toContain("test-ak");
    expect(JSON.stringify(result)).not.toContain("test-sk");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toContain("Action=CVGetResult");
  });
  it("does not infer authentication from an error envelope containing valid data", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(response({ status: "not_found" }, 50400));
    expect(await diagnoseOmniHumanVision(config(fetch))).toMatchObject({
      status: "unverified",
      code: "VISION_50400",
    });
  });
  it.each(["expired", "not_found"])(
    "preserves ambiguous %s outcomes for operator review",
    async (status) => {
      const fetch = vi.fn().mockResolvedValue(response({ status }));
      await expect(
        getOmniHumanVisionJob(config(fetch), "vision:omnihuman:123"),
      ).rejects.toMatchObject({
        code: "PROVIDER_OUTCOME_UNKNOWN",
        retryable: false,
      });
    },
  );
  it("re-polls the existing task to obtain a fresh output URL", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ status: "generating" }))
      .mockResolvedValueOnce(
        response({
          status: "done",
          resp_data: JSON.stringify({
            video_url: "https://example.com/fresh.mp4",
          }),
        }),
      );
    const input = config(fetch);
    await expect(
      getOmniHumanVisionJob(input, "vision:omnihuman:123"),
    ).resolves.toMatchObject({ status: "processing" });
    await expect(
      getOmniHumanVisionJob(input, "vision:omnihuman:123"),
    ).resolves.toMatchObject({
      status: "succeeded",
      outputUrls: ["https://example.com/fresh.mp4"],
    });
    for (const [url, init] of fetch.mock.calls) {
      expect(url).toContain("Action=CVGetResult");
      expect(JSON.parse(init.body).task_id).toBe("123");
    }
  });
  it("does not report cancellation when the task already executed", async () => {
    const fetch = vi.fn().mockResolvedValue(response(null, 50217));
    await expect(
      cancelOmniHumanVisionJob(config(fetch), "vision:omnihuman:123"),
    ).rejects.toMatchObject({ code: "VISION_50217" });
  });
});
