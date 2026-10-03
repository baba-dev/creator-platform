import { describe, expect, it } from "vitest";

import { VERIFIED_ALL_MODELS } from "../src/catalog";
import {
  listStudioTasksForModel,
  normalizeStudioTaskCapabilities,
  supportsStudioTask,
} from "../src/studio-tasks";

function model(id: string) {
  const found = VERIFIED_ALL_MODELS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing fixture model ${id}`);
  return found;
}

describe("studio task taxonomy", () => {
  it("normalizes legacy text capabilities into canonical task capabilities", () => {
    const seedCharacter = model("doubao-seed-character-260628");
    expect(seedCharacter.capabilities["task:chat"]).toBe(true);
    expect(seedCharacter.capabilities["task:character-chat"]).toBe(true);

    const seedLite = model("seed-2-0-lite-260428");
    expect(seedLite.capabilities["task:scriptwriting"]).toBe(true);
  });

  it("preserves verified product defaults as explicit task capabilities", () => {
    const dola = model("dola-seed-2-1-turbo-260628");
    expect(dola.capabilities["task:creative-director"]).toBe(true);
    expect(dola.capabilities["task:story-planning"]).toBe(true);

    const pro = model("seed-2-0-pro-260328");
    expect(pro.capabilities["task:brand-strategy"]).toBe(true);
  });

  it("keeps reasoning-only models out of text Studio tasks", () => {
    const groqReasoning = model("openai/gpt-oss-120b");
    expect(groqReasoning.capabilities["task:prompt-enhancement"]).toBe(true);
    expect(supportsStudioTask(groqReasoning, "creative-director")).toBe(false);
    expect(listStudioTasksForModel(groqReasoning)).toEqual([
      "prompt-enhancement",
    ]);
  });

  it("separates transcription from speech synthesis", () => {
    const whisper = model("whisper-large-v3-turbo");
    expect(whisper.capabilities["task:transcription"]).toBe(true);
    expect(whisper.capabilities["task:speech-synthesis"]).not.toBe(true);

    const speech = model("seed-tts-2.0");
    expect(speech.capabilities["task:speech-synthesis"]).toBe(true);
    expect(speech.capabilities["task:transcription"]).not.toBe(true);
  });

  it("normalizes media generation by media kind without leaking across kinds", () => {
    const normalized = normalizeStudioTaskCapabilities({
      id: "image",
      provider: "example",
      mediaKind: "image",
      capabilities: {},
    });
    expect(normalized["task:image-generation"]).toBe(true);
    expect(normalized["task:video-generation"]).not.toBe(true);
  });
});
