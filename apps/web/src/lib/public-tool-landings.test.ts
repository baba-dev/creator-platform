import { describe, expect, it } from "vitest";
import type { PublicPricingItem } from "./public-pricing-contract";
import {
  modelsForToolLanding,
  toolLandingBySlug,
  toolLandings,
} from "./public-tool-landings";
import { publicToolBySlug } from "./public-tools";

const requiredSlugs = [
  "ai-image-generator",
  "ai-video-generator",
  "ai-voice-generator",
  "ai-spokesperson",
  "ai-image-editor",
  "video-editor",
  "voice-casting",
  "ai-creative-director",
  "ai-scriptwriter",
  "character-chat",
  "media-toolkit",
  "pixel-ai",
] as const;

function model(
  category: PublicPricingItem["category"],
  availableIn: string[],
): PublicPricingItem {
  return {
    id: `${category}-${availableIn.join("-")}`,
    kind: category === "tools" ? "tool" : "model",
    name: "Test model",
    provider: "Test provider",
    description: "A safe public model description.",
    category,
    availableIn,
    capabilities: [],
    dimension: "REQUEST",
    unitQuantity: 1,
    creditsPerBaisa: "1",
    baseCredits: "10",
    baseOmr: "0.010 OMR",
    retailMicroUsdApprox: "26000",
    priceVersionId: "price-1",
    effectiveFrom: new Date(0).toISOString(),
    tiers: [],
    exampleOnly: false,
    calculator: "reference",
  };
}

describe("major public tool landing pages", () => {
  it("provides twelve unique, detailed pages backed by public tools", () => {
    expect(toolLandings).toHaveLength(requiredSlugs.length);
    expect(new Set(toolLandings.map((item) => item.slug)).size).toBe(
      toolLandings.length,
    );
    for (const slug of requiredSlugs) {
      const landing = toolLandingBySlug(slug);
      expect(landing).toBeDefined();
      expect(publicToolBySlug(slug)).toBeDefined();
      expect(landing?.seoDescription.length).toBeGreaterThan(100);
      expect(landing?.introduction.length).toBeGreaterThan(180);
      expect(landing?.screenshot.src).toBe(`/tool-screenshots/${slug}.jpg`);
      expect(landing?.features.length).toBeGreaterThanOrEqual(6);
      expect(landing?.steps).toHaveLength(4);
      expect(landing?.questions.length).toBeGreaterThanOrEqual(4);
      expect(landing?.relatedContent.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("selects task-specific live models with a category fallback", () => {
    const image = model("image", ["Image"]);
    const speech = model("speech", ["Speech"]);
    const imageLanding = toolLandingBySlug("ai-image-generator");
    expect(imageLanding).toBeDefined();
    expect(modelsForToolLanding(imageLanding!, [image, speech])).toEqual([
      image,
    ]);

    const director = model("chat", ["Creative Director"]);
    const genericChat = model("chat", ["Chat"]);
    const directorLanding = toolLandingBySlug("ai-creative-director");
    expect(directorLanding).toBeDefined();
    expect(
      modelsForToolLanding(directorLanding!, [genericChat, director]),
    ).toEqual([director]);

    expect(modelsForToolLanding(directorLanding!, [genericChat])).toEqual([
      genericChat,
    ]);
  });
});
