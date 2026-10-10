import { describe, expect, it } from "vitest";
import { socialSignUpDisabled } from "./social-signup-policy";

describe("OAuth signup policy", () => {
  it("permits OAuth registration when signups are enabled", () => {
    expect(socialSignUpDisabled(true)).toBe(false);
  });

  it("blocks new OAuth registrations when signups are paused", () => {
    expect(socialSignUpDisabled(false)).toBe(true);
  });
});
