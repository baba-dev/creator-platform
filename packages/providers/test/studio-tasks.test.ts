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

  it("keeps dual-use reasoners on explicit commercial text tasks", () => {
    const groqReasoning = model("openai/gpt-oss-120b");
    expect(groqReasoning.mediaKind).toBe("text");
    expect(groqReasoning.capabilities["task:prompt-enhancement"]).toBe(true);
    expect(supportsStudioTask(groqReasoning, "creative-director")).toBe(true);
    expect(supportsStudioTask(groqReasoning, "story-planning")).toBe(true);
    expect(supportsStudioTask(groqReasoning, "character-chat")).toBe(false);
    expect(listStudioTasksForModel(groqReasoning)).toEqual([
      "creative-director",
      "story-planning",
      "prompt-enhancement",
    ]);
  });

  it("separates transcription from speech synthesis", () => {
    const whisper = model("whisper-large-v3-turbo");
    expect(whisper.capabilities["task:transcription"]).toBe(true);
    expect(supportsStudioTask(whisper, "transcription")).toBe(true);
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

describe("dynamic text Studio task assignments", () => {
  it("exposes external TEXT models only to capabilities they explicitly support", () => {
    const cloudflare = model("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    expect(supportsStudioTask(cloudflare, "scriptwriting")).toBe(true);
    expect(supportsStudioTask(cloudflare, "creative-director")).toBe(true);
    expect(supportsStudioTask(cloudflare, "brand-strategy")).toBe(false);
    expect(supportsStudioTask(cloudflare, "story-planning")).toBe(false);

    const groqText = model("openai/gpt-oss-20b");
    expect(supportsStudioTask(groqText, "scriptwriting")).toBe(true);
    expect(supportsStudioTask(groqText, "creative-director")).toBe(false);

    const geminiText = model("gemini-3.5-flash-lite");
    expect(supportsStudioTask(geminiText, "scriptwriting")).toBe(true);
    expect(supportsStudioTask(geminiText, "creative-director")).toBe(false);
  });

  it("keeps verified BytePlus Brand and Story defaults on the TEXT pipeline", () => {
    const pro = model("seed-2-0-pro-260328");
    expect(supportsStudioTask(pro, "brand-strategy")).toBe(true);
    expect(supportsStudioTask(pro, "story-planning")).toBe(true);

    const dola = model("dola-seed-2-1-turbo-260628");
    expect(supportsStudioTask(dola, "creative-director")).toBe(true);
    expect(supportsStudioTask(dola, "story-planning")).toBe(true);
  });

  it("routes only the verified dual-use creative tasks through TEXT", () => {
    for (const id of ["openai/gpt-oss-120b", "gemini-3.8-flash"]) {
      const reasoning = model(id);
      expect(reasoning.mediaKind).toBe("text");
      expect(supportsStudioTask(reasoning, "creative-director")).toBe(true);
      expect(supportsStudioTask(reasoning, "story-planning")).toBe(true);
      expect(supportsStudioTask(reasoning, "chat")).toBe(false);
      expect(supportsStudioTask(reasoning, "scriptwriting")).toBe(false);
    }
  });
});

describe("multi-provider prompt enhancement task assignments", () => {
  it("allows verified reasoning models and the explicitly-capable Cloudflare text model", () => {
    for (const id of [
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
      "openai/gpt-oss-120b",
      "gemini-3.8-flash",
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    ]) {
      expect(supportsStudioTask(model(id), "prompt-enhancement")).toBe(true);
    }
  });

  it("does not treat generic text capability as prompt-enhancement permission", () => {
    expect(
      supportsStudioTask(model("openai/gpt-oss-20b"), "prompt-enhancement"),
    ).toBe(false);
    expect(
      supportsStudioTask(model("gemini-3.5-flash-lite"), "prompt-enhancement"),
    ).toBe(false);
  });
});
