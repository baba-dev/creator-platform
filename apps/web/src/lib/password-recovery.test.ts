import { describe, expect, it } from "vitest";

import {
  isPasswordResetTokenFailure,
  validatePasswordReset,
} from "./password-recovery";

describe("Password Recovery Flow", () => {
  it("validates password length and matching rules", () => {
    const tooShort = validatePasswordReset("short", "short");
    expect(tooShort).toBe("Password must be at least 12 characters long.");

    const mismatch = validatePasswordReset("abcdefghijkl", "mnopqrstuvwx");
    expect(mismatch).toBe("Passwords do not match.");

    const valid = validatePasswordReset("abcdefghijkl", "abcdefghijkl");
    expect(valid).toBeNull();
  });

  it("recognizes expired and invalid token failures", () => {
    expect(isPasswordResetTokenFailure({ status: 400 })).toBe(true);
    expect(isPasswordResetTokenFailure({ message: "token expired" })).toBe(
      true,
    );
    expect(isPasswordResetTokenFailure({ message: "invalid token" })).toBe(
      true,
    );
    expect(isPasswordResetTokenFailure({ status: 500 })).toBe(false);
  });
});
