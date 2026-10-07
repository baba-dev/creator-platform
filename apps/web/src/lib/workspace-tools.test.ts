import { describe, expect, it } from "vitest";

import {
  WORKSPACE_SECONDARY_ITEMS,
  WORKSPACE_TOOL_CATEGORIES,
  WORKSPACE_TOOLS,
  getWorkspaceBase,
  getWorkspaceItemHref,
  isWorkspaceCategoryActive,
  isWorkspaceItemActive,
} from "./workspace-tools";

describe("workspace tool registry", () => {
  it("keeps tool ids and route segments unique", () => {
    expect(new Set(WORKSPACE_TOOLS.map((item) => item.id)).size).toBe(
      WORKSPACE_TOOLS.length,
    );
    expect(new Set(WORKSPACE_TOOLS.map((item) => item.segment)).size).toBe(
      WORKSPACE_TOOLS.length,
    );
  });

  it("exposes the navigation-critical tools in their canonical categories", () => {
    const categoryByTool = new Map(
      WORKSPACE_TOOL_CATEGORIES.flatMap((category) =>
        category.items.map((item) => [item.id, category.key] as const),
      ),
    );

    expect(categoryByTool.get("audio-generation")).toBe("audio");
    expect(categoryByTool.get("character-chat")).toBe("creative");
    expect(categoryByTool.get("brand-story")).toBe("creative");
    expect(WORKSPACE_TOOLS.some((item) => item.id === "story-planner")).toBe(
      false,
    );
  });

  it("builds encoded workspace routes and keeps active-state boundaries correct", () => {
    const base = getWorkspaceBase("Baba Builds / Oman");
    expect(base).toBe("/app/Baba%20Builds%20%2F%20Oman");

    const voice = WORKSPACE_TOOLS.find((item) => item.id === "voice-studio")!;
    const transcription = WORKSPACE_TOOLS.find(
      (item) => item.id === "transcription",
    )!;
    const creative = WORKSPACE_TOOL_CATEGORIES.find(
      (category) => category.key === "creative",
    )!;

    expect(getWorkspaceItemHref(base, transcription)).toBe(
      `${base}/speech/transcription`,
    );
    expect(isWorkspaceItemActive(`${base}/speech`, base, voice)).toBe(true);
    expect(
      isWorkspaceItemActive(`${base}/speech/transcription`, base, voice),
    ).toBe(false);
    expect(
      isWorkspaceCategoryActive(`${base}/chat`, base, creative),
    ).toBe(true);
  });

  it("uses canonical secondary navigation names", () => {
    expect(
      WORKSPACE_SECONDARY_ITEMS.find((item) => item.id === "connections")
        ?.title,
    ).toBe("Connections & Storage");
    expect(
      WORKSPACE_SECONDARY_ITEMS.find((item) => item.id === "team")?.title,
    ).toBe("Team & Members");
  });
});
