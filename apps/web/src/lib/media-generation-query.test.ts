import { describe, expect, it } from "vitest";

import {
  MEDIA_GENERATION_KINDS,
  mediaGenerationJobFilter,
} from "./media-generation-query";

describe("media generation query", () => {
  it("keeps dashboard recents limited to generated media jobs", () => {
    expect(mediaGenerationJobFilter()).toEqual({
      providerModel: {
        mediaKind: { in: [...MEDIA_GENERATION_KINDS] },
      },
      NOT: {
        requestPayload: {
          path: "$.task",
          equals: "transcription",
        },
      },
    });
  });

  it.each(["IMAGE", "VIDEO", "VOICE"] as const)(
    "scopes dedicated %s studios to their own media kind",
    (kind) => {
      expect(mediaGenerationJobFilter(kind)).toEqual({
        providerModel: { mediaKind: kind },
        NOT: {
          requestPayload: {
            path: "$.task",
            equals: "transcription",
          },
        },
      });
    },
  );
});
