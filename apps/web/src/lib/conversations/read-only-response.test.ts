import { describe, expect, it } from "vitest";
import { answerCreativeQuestion } from "./read-only-response";
import type { ConversationPlannerContext } from "./context-builder";

const context: ConversationPlannerContext = {
  conversationId: "conv", title: "Creative test",
  activeModality: "IMAGE", currentModelId: "model-1",
  currentModelName: "Seedream 5.0", currentProvider: "BYTEPLUS",
  currentSettings: { aspectRatio: "1:1", resolution: "2K" },
  activeOutputGroup: [], selectedAssetId: null,
  compatibleActions: [], recentTurns: [],
};

describe("read-only conversation answers", () => {
  it("answers current model without dispatching a job", () => {
    expect(answerCreativeQuestion("Which model did you use?", context)).toContain("Seedream 5.0");
  });
  it("does not falsely claim unsupported last-frame execution", () => {
    expect(answerCreativeQuestion("Use this as the last frame", context)).toContain("Video Studio");
  });
});
