import { describe, expect, it } from "vitest";
import {
  OrganizationDomainError,
  StorageQuotaExceededError,
} from "@aiwa/organizations";
import { GenerationError } from "@aiwa/generation";
import { LedgerDomainError } from "@aiwa/credits";
import { ZodError } from "zod";
import { mapGenerationError, generationError } from "./generation-api";

describe("generation-api error mapper", () => {
  it("maps member StorageQuotaExceededError to HTTP 409 with specific domain error and remediation", () => {
    const error = new StorageQuotaExceededError("member");
    const result = mapGenerationError(error);

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("STORAGE_QUOTA_EXCEEDED");
    expect(result.body.scope).toBe("member");
    expect(result.body.remediation).toContain(
      "Delete existing member assets or request a storage quota increase from an organization owner.",
    );
    expect(result.body.error).toContain("Member storage quota exceeded.");
    expect(result.body.error).toContain("Delete existing member assets");

    const response = generationError(error);
    expect(response.status).toBe(409);
  });

  it("maps organization StorageQuotaExceededError to HTTP 409 with specific domain error and remediation", () => {
    const error = new StorageQuotaExceededError("organization");
    const result = mapGenerationError(error);

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("STORAGE_QUOTA_EXCEEDED");
    expect(result.body.scope).toBe("organization");
    expect(result.body.remediation).toContain(
      "Delete unused workspace assets or contact an administrator to increase organization storage quota.",
    );
    expect(result.body.error).toContain("Organization storage quota exceeded.");
    expect(result.body.error).toContain("Delete unused workspace assets");

    const response = generationError(error);
    expect(response.status).toBe(409);
  });

  it("maps OrganizationDomainError to HTTP 400", () => {
    const error = new OrganizationDomainError(
      "ORGANIZATION_LOCKED",
      "Organization is locked.",
    );
    const result = mapGenerationError(error);

    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      error: "Organization is locked.",
      code: "ORGANIZATION_LOCKED",
    });
  });

  it("maps GenerationError to its custom status and message", () => {
    const error = new GenerationError("Model is not active.", 404);
    const result = mapGenerationError(error);

    expect(result.status).toBe(404);
    expect(result.body).toEqual({
      error: "Model is not active.",
    });
  });

  it("maps LedgerDomainError to HTTP 400", () => {
    const error = new LedgerDomainError(
      "INSUFFICIENT_FUNDS",
      "Insufficient credits balance.",
    );
    const result = mapGenerationError(error);

    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      error: "Insufficient credits balance.",
    });
  });

  it("maps ZodError to HTTP 400 with friendly message", () => {
    const error = new ZodError([]);
    const result = mapGenerationError(error);

    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      error: "Invalid generation request.",
    });
  });

  it("maps unknown unexpected errors to generic HTTP 503", () => {
    const error = new Error("Database network socket closed");
    const result = mapGenerationError(error);

    expect(result.status).toBe(503);
    expect(result.body).toEqual({
      error: "Generation service unavailable. Retry with the same request.",
    });
  });
});
