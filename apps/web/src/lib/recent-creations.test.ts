import { describe, expect, it } from "vitest";
import { creationPrompt } from "./recent-creations";
describe("recent creation copy", () => {
  it("understands studio and voice prompts", () => {
    expect(creationPrompt({ textPrompt: "A portrait" })).toBe("A portrait");
    expect(creationPrompt({ sourceText: "Read this" })).toBe("Read this");
  });
  it("does not leak arbitrary payload fields", () => {
    expect(creationPrompt({ apiKey: "secret", internal: "private" })).toBe(
      "Untitled creation",
    );
    expect(creationPrompt(null)).toBe("Untitled creation");
  });
});
