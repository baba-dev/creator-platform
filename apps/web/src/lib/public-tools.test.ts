import { describe, expect, it } from "vitest";
import { WORKSPACE_TOOLS } from "./workspace-tools";
import {
  findPublicTools,
  publicToolById,
  publicToolBySlug,
  publicTools,
  recommendTools,
  toolHref,
} from "./public-tools";

describe("public tool catalogue", () => {
  it("covers the canonical workspace tools with unique, safe slugs", () => {
    expect(publicTools).toHaveLength(WORKSPACE_TOOLS.length + 1);
    expect(new Set(publicTools.map((tool) => tool.id)).size).toBe(
      publicTools.length,
    );
    expect(new Set(publicTools.map((tool) => tool.slug)).size).toBe(
      publicTools.length,
    );
    for (const tool of publicTools) {
      expect(tool.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(tool.summary.length).toBeGreaterThan(80);
      expect(publicToolBySlug(tool.slug)?.id).toBe(tool.id);
      expect(publicToolById(tool.id)?.segment).toBe(tool.segment);
      expect(toolHref(tool)).toBe("/tools/" + tool.slug);
      expect(tool.useCases.length).toBeGreaterThanOrEqual(3);
      expect(tool.workflow.length).toBe(3);
    }
    expect(publicToolById("pixel-ai")?.slug).toBe("pixel-ai");
    expect(publicToolById("mediakit")?.slug).toBe("media-toolkit");
  });
  it("supports customer language and category filtering", () => {
    expect(
      findPublicTools("animate photo").some(
        (tool) => tool.id === "video-studio",
      ),
    ).toBe(true);
    expect(
      findPublicTools("srt").some((tool) => tool.id === "transcription"),
    ).toBe(true);
    expect(findPublicTools("narration", "image")).toHaveLength(0);
    expect(findPublicTools(" ")).toHaveLength(publicTools.length);
  });
  it("returns curated, real tool IDs without external execution", () => {
    expect(recommendTools("video", "image")[0]?.id).toBe("video-studio");
    expect(recommendTools("transcribe", "audio")[0]?.id).toBe("transcription");
    expect(recommendTools("transcribe", "idea")).toHaveLength(0);
  });
});
