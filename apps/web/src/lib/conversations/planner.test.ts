import { describe, expect, it, vi } from "vitest";
import { planConversationTurn } from "./planner";
import { parseOutputIndex } from "./reference-resolver";
import { deriveDeterministicTitle } from "./title-generator";
import type { ConversationPlannerContext } from "./context-builder";

// Mock DB
vi.mock("@aiwa/db", () => ({
  db: {
    asset: {
      findFirst: vi.fn().mockImplementation(({ where }) => {
        if (where.id === "asset_902" && where.organizationId === "org_1") {
          return Promise.resolve({ id: "asset_902" });
        }
        if (where.id === "asset_901" && where.organizationId === "org_1") {
          return Promise.resolve({ id: "asset_901" });
        }
        if (where.id === "asset_foreign") {
          return Promise.resolve(null); // cross-org rejected
        }
        return Promise.resolve({ id: where.id });
      }),
    },
    chatThread: {
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

describe("Conversational Creative Action Planner", () => {
  const baseContext: ConversationPlannerContext = {
    conversationId: "conv_123",
    title: "Perfume Campaign",
    activeModality: "IMAGE",
    currentModelId: "model_image_1",
    currentProvider: "BYTEPLUS",
    currentSettings: {
      aspectRatio: "1:1",
      resolution: "2K",
      outputCount: 1,
    },
    activeOutputGroup: [
      { index: 1, assetId: "asset_901", mimeType: "image/png" },
      { index: 2, assetId: "asset_902", mimeType: "image/png" },
      { index: 3, assetId: "asset_903", mimeType: "image/png" },
      { index: 4, assetId: "asset_904", mimeType: "image/png" },
    ],
    selectedAssetId: "asset_902",
    compatibleActions: [
      "select_asset",
      "generate_image",
      "change_aspect_ratio",
    ],
    recentTurns: [],
  };

  it("plans state-only asset selection: 'Use the second image.'", async () => {
    const plan = await planConversationTurn({
      userMessage: "Use the second image.",
      organizationId: "org_1",
      context: baseContext,
    });

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toEqual({
      type: "select_asset",
      target: { kind: "output_index", index: 2 },
    });
  });

  it("plans aspect ratio patch: 'Make it 9:16.'", async () => {
    const plan = await planConversationTurn({
      userMessage: "Make it 9:16.",
      organizationId: "org_1",
      context: baseContext,
    });

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toEqual({
      type: "change_aspect_ratio",
      aspectRatio: "9:16",
    });
  });

  it("does not ask which asset when changing ratio across a multi-output set", async () => {
    const plan = await planConversationTurn({
      userMessage: "Make it 9:16.",
      organizationId: "org_1",
      context: baseContext,
    });

    expect(plan.actions).toEqual([
      {
        type: "change_aspect_ratio",
        aspectRatio: "9:16",
      },
    ]);
  });

  it("plans aspect ratio patch from natural language synonyms: 'Make it vertical.'", async () => {
    const plan = await planConversationTurn({
      userMessage: "Make it vertical.",
      organizationId: "org_1",
      context: baseContext,
    });

    expect(plan.actions[0]).toEqual({
      type: "change_aspect_ratio",
      aspectRatio: "9:16",
    });
  });

  it("plans variations: 'Give me four variations.'", async () => {
    const plan = await planConversationTurn({
      userMessage: "Give me four variations.",
      organizationId: "org_1",
      context: baseContext,
    });

    expect(plan.actions[0]?.type).toBe("create_variations");
    if (plan.actions[0]?.type === "create_variations") {
      expect(plan.actions[0].outputCount).toBe(4);
    }
  });

  it("does not parse a variation count as an output ordinal", async () => {
    const singleOutputContext: ConversationPlannerContext = {
      ...baseContext,
      selectedAssetId: "asset_901",
      activeOutputGroup: [
        { index: 1, assetId: "asset_901", mimeType: "image/png" },
      ],
    };
    const plan = await planConversationTurn({
      userMessage: "Give me four variations.",
      organizationId: "org_1",
      context: singleOutputContext,
    });

    expect(plan.actions[0]).toEqual(
      expect.objectContaining({
        type: "create_variations",
        outputCount: 4,
        sourceAssetId: "asset_901",
      }),
    );
  });

  it("treats explicit UI 'Select asset' as a zero-credit state action", async () => {
    const plan = await planConversationTurn({
      userMessage: "Select asset",
      organizationId: "org_1",
      context: baseContext,
      explicitAssetId: "asset_901",
    });

    expect(plan.actions).toEqual([
      {
        type: "select_asset",
        target: { kind: "asset_id", assetId: "asset_901" },
      },
    ]);
  });

  it("does not treat the 'it' inside another word as a relative reference", async () => {
    const emptyContext: ConversationPlannerContext = {
      ...baseContext,
      selectedAssetId: null,
      activeOutputGroup: [],
    };
    const plan = await planConversationTurn({
      userMessage: "A bottle with dramatic golden lighting",
      organizationId: "org_1",
      context: emptyContext,
    });

    expect(plan.actions[0]?.type).toBe("generate_image");
  });

  it("treats enhancement direction as an edit of the focused image", async () => {
    const plan = await planConversationTurn({
      userMessage: "Enhance with dramatic cinematic lighting and high contrast",
      organizationId: "org_1",
      context: baseContext,
      explicitAssetId: "asset_902",
    });

    expect(plan.actions).toEqual([
      {
        type: "edit_image",
        prompt: "Enhance with dramatic cinematic lighting and high contrast",
        sourceAssetId: "asset_902",
      },
    ]);
  });

  it("plans model switch: 'Try another model.'", async () => {
    const plan = await planConversationTurn({
      userMessage: "Try another model.",
      organizationId: "org_1",
      context: baseContext,
    });

    expect(plan.actions[0]).toEqual({
      type: "switch_model",
      excludeCurrentModel: true,
      targetMediaKind: "IMAGE",
    });
  });

  it("maps a numbered output to video first frame instead of selection-only", async () => {
    const plan = await planConversationTurn({
      userMessage: "Use the second image as the first frame for video.",
      organizationId: "org_1",
      context: baseContext,
    });

    expect(plan.actions[0]).toEqual({
      type: "use_first_frame",
      assetId: "asset_902",
      target: { kind: "selected_asset" },
    });
  });

  it("plans cross-modal animation: 'Animate this.'", async () => {
    const plan = await planConversationTurn({
      userMessage: "Animate this.",
      organizationId: "org_1",
      context: baseContext,
    });

    expect(plan.actions[0]?.type).toBe("generate_video");
    if (plan.actions[0]?.type === "generate_video") {
      expect(plan.actions[0].firstFrameAssetId).toBe("asset_902");
      expect(plan.actions[0].workflow).toBe("FRAME_TO_VIDEO");
    }
  });

  it("plans speech rate change: 'Make the voice slower.' and 'Make it slower'", async () => {
    const voiceContext: ConversationPlannerContext = {
      ...baseContext,
      activeModality: "VOICE",
    };
    const plan = await planConversationTurn({
      userMessage: "Make the voice slower.",
      organizationId: "org_1",
      context: voiceContext,
    });

    expect(plan.actions[0]).toEqual({
      type: "change_speaking_rate",
      speechRate: 0.8,
    });

    const chipPlan = await planConversationTurn({
      userMessage: "Make it slower",
      organizationId: "org_1",
      context: voiceContext,
    });
    expect(chipPlan.actions[0]).toEqual({
      type: "change_speaking_rate",
      speechRate: 0.8,
    });
  });

  it("plans speech rate change: 'Make it faster' matching 1.2x UI chip", async () => {
    const voiceContext: ConversationPlannerContext = {
      ...baseContext,
      activeModality: "VOICE",
    };
    const plan = await planConversationTurn({
      userMessage: "Make it faster",
      organizationId: "org_1",
      context: voiceContext,
    });

    expect(plan.actions[0]).toEqual({
      type: "change_speaking_rate",
      speechRate: 1.2,
    });
  });

  it("plans retry generation for both 'retry' and 'Retry generation'", async () => {
    const plan1 = await planConversationTurn({
      userMessage: "retry",
      organizationId: "org_1",
      context: baseContext,
    });
    expect(plan1.actions[0]?.type).toBe("retry_generation");

    const plan2 = await planConversationTurn({
      userMessage: "Retry generation",
      organizationId: "org_1",
      context: baseContext,
    });
    expect(plan2.actions[0]?.type).toBe("retry_generation");
  });

  it("plans multi-action turn: 'Use the third image and animate it.'", async () => {
    const plan = await planConversationTurn({
      userMessage: "Use the third image and animate it.",
      organizationId: "org_1",
      context: baseContext,
    });

    expect(plan.actions).toHaveLength(2);
    expect(plan.actions[0]).toEqual({
      type: "select_asset",
      target: { kind: "output_index", index: 3 },
    });
    expect(plan.actions[1]?.type).toBe("generate_video");
    expect(plan.actions[1]).toEqual(
      expect.objectContaining({ firstFrameAssetId: "asset_903" }),
    );
  });

  it("prefers a numbered reference over passive UI focus", async () => {
    const plan = await planConversationTurn({
      userMessage: "Give me four variations of the second image",
      organizationId: "org_1",
      context: { ...baseContext, selectedAssetId: "asset_901" },
      explicitAssetId: "asset_901",
    });

    expect(plan.actions[0]).toEqual({
      type: "create_variations",
      sourceAssetId: "asset_902",
      outputCount: 4,
    });
  });

  it("composes numbered selection with an aspect-ratio change", async () => {
    const plan = await planConversationTurn({
      userMessage: "Use the second image and make it 9:16",
      organizationId: "org_1",
      context: { ...baseContext, selectedAssetId: "asset_901" },
      explicitAssetId: "asset_901",
    });

    expect(plan.actions).toEqual([
      { type: "select_asset", target: { kind: "output_index", index: 2 } },
      { type: "change_aspect_ratio", aspectRatio: "9:16" },
    ]);
  });

  it("treats ordinary background direction as an edit", async () => {
    const plan = await planConversationTurn({
      userMessage: "Make the background blue",
      organizationId: "org_1",
      context: baseContext,
    });

    expect(plan.actions[0]).toEqual({
      type: "edit_image",
      prompt: "Make the background blue",
      sourceAssetId: "asset_902",
    });
  });

  it("allows an explicit fresh image request without active assets", async () => {
    const plan = await planConversationTurn({
      userMessage: "Generate an image of a cat",
      organizationId: "org_1",
      context: { ...baseContext, selectedAssetId: null, activeOutputGroup: [] },
    });

    expect(plan.actions[0]).toEqual(
      expect.objectContaining({
        type: "generate_image",
        prompt: "Generate an image of a cat",
      }),
    );
  });

  it("does not use an active video as a first-frame image", async () => {
    const plan = await planConversationTurn({
      userMessage: "Make the camera move slowly",
      organizationId: "org_1",
      context: {
        ...baseContext,
        activeModality: "VIDEO",
        selectedAssetId: "video_1",
        activeOutputGroup: [
          { index: 1, assetId: "video_1", mimeType: "video/mp4" },
        ],
      },
      explicitAssetId: "video_1",
    });

    expect(plan.actions[0]).toEqual({
      type: "generate_video",
      prompt: "Make the camera move slowly",
      outputFormat: "mp4",
    });
  });

  it("triggers clarify action on out-of-range output index", async () => {
    const plan = await planConversationTurn({
      userMessage: "Use the tenth image.",
      organizationId: "org_1",
      context: baseContext,
    });

    expect(plan.actions[0]?.type).toBe("clarify");
    if (plan.actions[0]?.type === "clarify") {
      expect(plan.actions[0].question).toContain("only 4 images");
      expect(plan.actions[0].options).toHaveLength(4);
    }
  });

  it("parses various index phrases accurately", () => {
    expect(parseOutputIndex("the second image")).toBe(2);
    expect(parseOutputIndex("image 3")).toBe(3);
    expect(parseOutputIndex("output #4")).toBe(4);
    expect(parseOutputIndex("1st one")).toBe(1);
    expect(parseOutputIndex("third picture")).toBe(3);
  });

  it("derives deterministic 3-7 word titles cleanly", () => {
    expect(
      deriveDeterministicTitle(
        "A cinematic product photograph in warm Omani desert light with golden sand dunes",
      ),
    ).toBe("Warm Omani Desert Light With Golden");

    expect(
      deriveDeterministicTitle(
        "Create a cartoon mascot for a children's toy store in Muscat",
      ),
    ).toBe("Cartoon Mascot For A Children's Toy");
  });
});
