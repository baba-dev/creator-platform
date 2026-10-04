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

  it("plans speech rate change: 'Make the voice slower.'", async () => {
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
