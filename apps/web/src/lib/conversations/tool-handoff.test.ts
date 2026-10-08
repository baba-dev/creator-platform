import { describe, expect, it } from "vitest";
import { resolveCreativeToolHandoff } from "./tool-handoff";

describe("creative tool handoff", () => {
  it("routes explicit specialist tasks to registered workbenches", () => {
    expect(resolveCreativeToolHandoff("Please transcribe this audio")?.id).toBe("transcription");
    expect(resolveCreativeToolHandoff("Open Seed Audio")?.id).toBe("audio-generation");
    expect(resolveCreativeToolHandoff("Help me write a script")?.id).toBe("scriptwriter");
  });
  it("does not hijack ordinary creative prompts", () => {
    expect(resolveCreativeToolHandoff("A cinematic talking avatar on a hill")).toBeNull();
    expect(resolveCreativeToolHandoff("Portrait of a screenwriter")).toBeNull();
  });
});
