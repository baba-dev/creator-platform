import { describe, expect, it } from "vitest";

import { getGenerationErrorPresentation } from "./generation-error-copy";

describe("generation error copy", () => {
  it("explains an output-image safety rejection without blaming the prompt", () => {
    expect(
      getGenerationErrorPresentation({
        status: "FAILED",
        errorCode: "OutputImageSensitiveContentDetected",
        errorMessage: "Provider rejected the image request. Credits released.",
      }),
    ).toEqual({
      title: "Generated image was blocked by the safety filter",
      description:
        "The provider flagged the generated image as potentially sensitive. This can happen even when the prompt itself is acceptable.",
      nextStep:
        "Try rewording the prompt or changing reference images, then generate again.",
    });
  });

  it("explains common input moderation failures", () => {
    const result = getGenerationErrorPresentation({
      status: "FAILED",
      errorCode: "InputImageSensitiveContentDetected",
    });
    expect(result?.title).toBe("Input was blocked by the safety filter");
    expect(result?.description).toContain("reference image");
  });

  it("explains manual-review outcomes without encouraging replay", () => {
    const result = getGenerationErrorPresentation({
      status: "MANUAL_REVIEW",
      errorCode: "PROVIDER_OUTCOME_UNKNOWN",
    });
    expect(result?.description).toContain("not automatically submitted again");
    expect(result?.nextStep).toContain("Do not resubmit");
  });

  it("falls back to the existing safe application message", () => {
    const result = getGenerationErrorPresentation({
      status: "FAILED",
      errorCode: "SOME_FUTURE_PROVIDER_CODE",
      errorMessage: "Generation failed safely. Credits released.",
    });
    expect(result?.description).toBe(
      "Generation failed safely. Credits released.",
    );
  });

  it("returns null when no failure information exists", () => {
    expect(getGenerationErrorPresentation({ status: "SUCCEEDED" })).toBeNull();
  });
});
