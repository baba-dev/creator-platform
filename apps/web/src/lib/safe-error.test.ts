import { describe, expect, it } from "vitest";
import { safeErrorMessage } from "./safe-error";
import {
  OrganizationDomainError,
  StorageQuotaExceededError,
} from "@aiwa/organizations";
import { GenerationError } from "@aiwa/generation";
import { z } from "zod";

describe("safeErrorMessage", () => {
  const fallback = "Operation failed. Please try again.";

  it("returns fallback for native runtime TypeErrors", () => {
    const error = new TypeError(
      "Cannot read properties of undefined (reading 'foo')",
    );
    expect(safeErrorMessage(error, fallback)).toBe(fallback);
  });

  it("returns fallback for SyntaxErrors", () => {
    const error = new SyntaxError("Unexpected token < in JSON at position 0");
    expect(safeErrorMessage(error, fallback)).toBe(fallback);
  });

  it("returns fallback for RangeErrors", () => {
    const error = new RangeError("Maximum call stack size exceeded");
    expect(safeErrorMessage(error, fallback)).toBe(fallback);
  });

  it("returns fallback for filesystem errors leaking paths", () => {
    const error = new Error(
      "ENOENT: no such file or directory, open '/var/www/creator/shared/secret.key'",
    );
    expect(safeErrorMessage(error, fallback)).toBe(fallback);
  });

  it("returns fallback for database query errors leaking SQL", () => {
    const error = new Error(
      "SELECT id, balanceCache FROM Wallet WHERE id = 'abc' failed with connection reset",
    );
    expect(safeErrorMessage(error, fallback)).toBe(fallback);
  });

  it("returns fallback for unlisted plain generic Errors", () => {
    const error = new Error(
      "Something strange happened inside library internals",
    );
    expect(safeErrorMessage(error, fallback)).toBe(fallback);
  });

  it("returns fallback for non-Error values", () => {
    expect(safeErrorMessage("plain string error", fallback)).toBe(fallback);
    expect(safeErrorMessage(null, fallback)).toBe(fallback);
    expect(safeErrorMessage(undefined, fallback)).toBe(fallback);
    expect(safeErrorMessage({ error: "bad" }, fallback)).toBe(fallback);
  });

  it("allows intentional OrganizationDomainError messages", () => {
    const error = new OrganizationDomainError(
      "ORGANIZATION_NOT_FOUND",
      "Organization not found.",
    );
    expect(safeErrorMessage(error, fallback)).toBe("Organization not found.");
  });

  it("allows StorageQuotaExceededError messages", () => {
    const error = new StorageQuotaExceededError("organization");
    expect(safeErrorMessage(error, fallback)).toBe(
      "Organization storage quota exceeded.",
    );
  });

  it("allows GenerationError messages", () => {
    const error = new GenerationError(
      "The requested model is currently unavailable.",
      503,
    );
    expect(safeErrorMessage(error, fallback)).toBe(
      "The requested model is currently unavailable.",
    );
  });

  it("allows exact whitelisted domain messages", () => {
    expect(safeErrorMessage(new Error("File exceeds 100 MB."), fallback)).toBe(
      "File exceeds 100 MB.",
    );
    expect(
      safeErrorMessage(new Error("Choose an MP4, MP3 or WAV file."), fallback),
    ).toBe("Choose an MP4, MP3 or WAV file.");
    expect(
      safeErrorMessage(
        new Error("A folder with this name already exists here."),
        fallback,
      ),
    ).toBe("A folder with this name already exists here.");
    expect(
      safeErrorMessage(new Error("Too many assets selected."), fallback),
    ).toBe("Too many assets selected.");
  });

  it("formats Zod validation errors cleanly without dumping internal schemas", () => {
    const schema = z.object({
      email: z.string().email("Invalid email address"),
    });
    const result = schema.safeParse({ email: "not-an-email" });
    if (!result.success) {
      expect(safeErrorMessage(result.error, fallback)).toBe(
        "email: Invalid email address",
      );
    }
  });
});
