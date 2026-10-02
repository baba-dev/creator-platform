import { describe, expect, it } from "vitest";
import { normalizeTextMessagesForModel, textResultFromJob } from "../src/text";

describe("text generation hardening", () => {
  it("preserves system instructions and newest turns inside model context", () => {
    const messages = [
      { role: "system" as const, content: "system".repeat(100) },
      ...Array.from({ length: 12 }, (_, index) => ({
        role: (index % 2 ? "assistant" : "user") as "assistant" | "user",
        content: `turn-${index}-` + "x".repeat(1200),
      })),
    ];
    const packed = normalizeTextMessagesForModel(
      messages,
      { contextWindow: 4096 },
      1024,
    );
    expect(packed[0]?.role).toBe("system");
    expect(packed.at(-1)?.content).toContain("turn-11");
    expect(packed.length).toBeLessThan(messages.length);
  });

  it("rejects a latest message that cannot fit the selected model", () => {
    expect(() =>
      normalizeTextMessagesForModel(
        [
          { role: "system", content: "Be concise." },
          { role: "user", content: "x".repeat(30_000) },
        ],
        { contextWindow: 4096 },
        2048,
      ),
    ).toThrow("latest message is too large");
  });

  it("reads durable succeeded text output", () => {
    expect(
      textResultFromJob({
        id: "job_1",
        status: "SUCCEEDED",
        outputPayload: {
          content: "done",
          usage: {
            promptTokens: 10,
            completionTokens: 5,
            totalTokens: 15,
          },
        },
        chargedCredits: 4n,
        errorMessage: null,
      }),
    ).toEqual({
      jobId: "job_1",
      status: "SUCCEEDED",
      content: "done",
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
      chargedCredits: 4,
    });
  });

  it("surfaces terminal failures without pretending they are pending", () => {
    expect(() =>
      textResultFromJob({
        id: "job_2",
        status: "FAILED",
        outputPayload: null,
        chargedCredits: 0n,
        errorMessage: "Provider rejected request.",
      }),
    ).toThrow("Provider rejected request.");
  });
});
