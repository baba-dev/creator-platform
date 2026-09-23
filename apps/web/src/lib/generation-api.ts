import { GenerationError } from "@aiwa/generation";
import { LedgerDomainError } from "@aiwa/credits";
import {
  MEMBER_STORAGE_QUOTA_BYTES,
  ORGANIZATION_STORAGE_QUOTA_BYTES,
  OrganizationDomainError,
  StorageQuotaExceededError,
} from "@aiwa/organizations";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

function formatBytes(bytes: bigint): string {
  const gib = Number(bytes) / 1024 ** 3;
  return `${gib.toFixed(gib >= 10 ? 0 : 2)} GiB`;
}

export function mapGenerationError(error: unknown): {
  body: Record<string, unknown>;
  status: number;
} {
  if (error instanceof StorageQuotaExceededError) {
    const quotaBytes =
      error.quotaBytes ??
      (error.scope === "member"
        ? MEMBER_STORAGE_QUOTA_BYTES
        : ORGANIZATION_STORAGE_QUOTA_BYTES);
    const remediation =
      error.scope === "member"
        ? "Delete existing member assets or request a storage quota increase from an organization owner."
        : "Delete unused workspace assets or contact an administrator to increase organization storage quota.";
    const usedBytes = error.usedBytes;
    const proposedBytes = error.proposedBytes;
    const availableBytes =
      usedBytes === undefined
        ? undefined
        : usedBytes >= quotaBytes
          ? 0n
          : quotaBytes - usedBytes;
    return {
      body: {
        error: `${error.message} Limit: ${formatBytes(
          quotaBytes,
        )}. ${remediation}`,
        code: error.code,
        scope: error.scope,
        remediation,
        quotaBytes: quotaBytes.toString(),
        quotaLabel: formatBytes(quotaBytes),
        ...(usedBytes === undefined ? {} : { usedBytes: usedBytes.toString() }),
        ...(proposedBytes === undefined
          ? {}
          : { proposedBytes: proposedBytes.toString() }),
        ...(availableBytes === undefined
          ? {}
          : { availableBytes: availableBytes.toString() }),
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
