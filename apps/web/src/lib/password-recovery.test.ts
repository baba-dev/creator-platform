import { describe, expect, it } from "vitest";

describe("Password Recovery Flow", () => {
  it("validates password length and matching rules", () => {
    const validatePasswordReset = (
      password: string,
      confirmPassword: string,
    ) => {
      if (password.length < 12) {
        return "Password must be at least 12 characters long.";
      }
      if (password !== confirmPassword) {
        return "Passwords do not match.";
      }
      return null;
    };

    expect(validatePasswordReset("short", "short")).toBe(
      "Password must be at least 12 characters long.",
    );
    expect(validatePasswordReset("validpassword123", "different123456")).toBe(
      "Passwords do not match.",
    );
    expect(
      validatePasswordReset("validpassword123", "validpassword123"),
    ).toBeNull();
  });

  it("handles expired and invalid tokens gracefully", () => {
    const isTokenFailure = (errorStatus: number, errorMessage: string) => {
      const msg = errorMessage.toLowerCase();
      return (
        errorStatus === 400 ||
        msg.includes("token") ||
        msg.includes("expired") ||
        msg.includes("invalid")
      );
    };

    expect(isTokenFailure(400, "Bad Request")).toBe(true);
    expect(isTokenFailure(401, "The token has expired")).toBe(true);
    expect(isTokenFailure(404, "Invalid token provided")).toBe(true);
    expect(isTokenFailure(500, "Internal Server Error")).toBe(false);
  });
});
