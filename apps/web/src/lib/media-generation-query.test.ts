import { describe, expect, it } from "vitest";
import {
  MEDIA_GENERATION_KINDS,
  mediaGenerationJobFilter,
} from "./media-generation-query";

describe("media generation query", () => {
  it("uses durable eligibility instead of a nullable JSON path predicate", () => {
    expect(mediaGenerationJobFilter()).toEqual({
      mediaHistoryEligible: true,
      providerModel: { mediaKind: { in: [...MEDIA_GENERATION_KINDS] } },
    });
    expect(JSON.stringify(mediaGenerationJobFilter())).not.toContain(
      "requestPayload",
    );
  });
  it.each(["IMAGE", "VIDEO", "VOICE"] as const)(
    "scopes %s studios without losing legacy payloads",
    (kind) => {
      expect(mediaGenerationJobFilter(kind)).toEqual({
        mediaHistoryEligible: true,
        providerModel: { mediaKind: kind },
      });
    },
  );
});
