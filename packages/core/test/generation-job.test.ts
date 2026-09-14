import { describe, expect, it } from "vitest";

import {
  assertGenerationJobTransition,
  canTransitionGenerationJob,
  isTerminalGenerationJobStatus,
} from "../src/index";

describe("generation job lifecycle", () => {
  it("accepts the normal reservation and queue path", () => {
    expect(canTransitionGenerationJob("QUOTED", "CREDIT_RESERVED")).toBe(true);
    expect(canTransitionGenerationJob("CREDIT_RESERVED", "QUEUED")).toBe(true);
  });

  it("blocks impossible state changes", () => {
    expect(() =>
      assertGenerationJobTransition("SUCCEEDED", "PROCESSING"),
    ).toThrow("Invalid generation job transition");
  });

  it("identifies final states", () => {
    expect(isTerminalGenerationJobStatus("SUCCEEDED")).toBe(true);
    expect(isTerminalGenerationJobStatus("MANUAL_REVIEW")).toBe(false);
  });
});
