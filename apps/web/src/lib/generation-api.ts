import { GenerationError } from "@aiwa/generation";
import { LedgerDomainError } from "@aiwa/credits";
import {
  OrganizationDomainError,
  StorageQuotaExceededError,
} from "@aiwa/organizations";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function mapGenerationError(error: unknown): {
  body: Record<string, unknown>;
  status: number;
} {
  if (error instanceof StorageQuotaExceededError) {
    const remediation =
      error.scope === "member"
        ? "Delete existing member assets or request a storage quota increase from an organization owner."
        : "Delete unused workspace assets or contact an administrator to increase organization storage quota.";
    return {
      body: {
        error: `${error.message} ${remediation}`,
        code: error.code,
        scope: error.scope,
        remediation,
      },
      status: 409,
    };
  }

  if (error instanceof OrganizationDomainError) {
    return {
      body: { error: error.message, code: error.code },
      status: 400,
    };
  }

  if (error instanceof GenerationError) {
    return {
      body: { error: error.message },
      status: error.status,
    };
  }

  if (
    error instanceof ZodError ||
    error instanceof SyntaxError ||
    error instanceof LedgerDomainError
  ) {
    return {
      body: {
        error:
          error instanceof LedgerDomainError
            ? error.message
            : "Invalid generation request.",
      },
      status: 400,
    };
  }

  return {
    body: {
      error: "Generation service unavailable. Retry with the same request.",
    },
    status: 503,
  };
}

export function generationError(error: unknown): NextResponse {
  const { body, status } = mapGenerationError(error);
  return NextResponse.json(body, { status });
}
