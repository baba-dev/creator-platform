import { describe, expect, it } from "vitest";

import { inspectTalkingAvatarSources } from "../src/talking-avatar";
import type { VideoRequestV2 } from "../src/video-contract";

function request(): VideoRequestV2 {
  return {
    schemaVersion: 2,
    organizationId: "org",
    modelId: "model",
    priceVersionId: "price",
    idempotencyKey: "123e4567-e89b-42d3-a456-426614174200",
    workflow: "TALKING_AVATAR",
    prompt: "",
    sources: [
      { assetId: "avatar", role: "AVATAR_IMAGE", position: 0 },
      { assetId: "audio", role: "DRIVING_AUDIO", position: 1 },
    ],
    aspectRatio: "adaptive",
    resolution: "1080p",
    durationSeconds: -1,
    generateAudio: false,
    outputFormat: "mp4",
    returnLastFrame: false,
  };
}

describe("talking-avatar source inspection", () => {
  it("derives billable seconds from trusted audio metadata", () => {
    const facts = inspectTalkingAvatarSources(
      request(),
      new Map([
        [
          "avatar",
          {
            id: "avatar",
            mediaKind: "IMAGE",
            mimeType: "image/jpeg",
            byteSize: 1_000_000n,
            durationMs: null,
            width: 1024,
            height: 1024,
          },
        ],
        [
          "audio",
          {
            id: "audio",
            mediaKind: "AUDIO",
            mimeType: "audio/mpeg",
            byteSize: 2_000_000n,
            durationMs: 15_001,
            width: null,
            height: null,
          },
        ],
      ]),
    );
    expect(facts.drivingAudioDurationMs).toBe(15_001);
    expect(facts.billableDurationSeconds).toBe(16);
  });

  it("rejects provider-limit violations before quoting", () => {
    expect(() =>
      inspectTalkingAvatarSources(
        request(),
        new Map([
          [
            "avatar",
            {
              id: "avatar",
              mediaKind: "IMAGE",
              mimeType: "image/jpeg",
              byteSize: 5_000_000n,
              durationMs: null,
              width: 1024,
              height: 1024,
            },
          ],
          [
            "audio",
            {
              id: "audio",
              mediaKind: "AUDIO",
              mimeType: "audio/mpeg",
              byteSize: 1_000_000n,
              durationMs: 60_000,
              width: null,
              height: null,
            },
          ],
        ]),
      ),
    ).toThrow(/avatar image/i);
  });
});
