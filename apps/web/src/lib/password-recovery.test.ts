import { describe, expect, it } from "vitest";

import {
  isPasswordResetTokenFailure,
  validatePasswordReset,
} from "./password-recovery";

describe("Password Recovery Flow", () => {
  it("validates password length and matching rules", () => {
    expect(validatePasswordReset("short", "short")).toBe(
      "Password must be at least 12 characters long.",
    );
    expect(
      validatePasswordReset("validpassword123", "different123456"),
    ).toBe("Passwords do not match.");
    expect(
      validatePasswordReset("validpassword123", "validpassword123"),
    ).toBeNull();
  });

  it("recognizes expired and invalid token failures", () => {
    expect(
      isPasswordResetTokenFailure({ status: 400, message: "Bad Request" }),
    ).toBe(true);
    expect(
      isPasswordResetTokenFailure({
        status: 401,
        message: "The token has expired",
      }),
    ).toBe(true);
    expect(
      isPasswordResetTokenFailure({
        status: 404,
        message: "Invalid token provided",
      }),
    ).toBe(true);
    expect(
      isPasswordResetTokenFailure({
        status: 500,
        message: "Internal Server Error",
      }),
    ).toBe(false);
  });
});
