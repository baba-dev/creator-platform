import { transcriptionLanguageHint } from "./locale";
import { hasOrganizationPermission } from "@aiwa/authz";
import { finalizeAssetStorage, releaseAssetStorage } from "@aiwa/assets";
import { resolveAssetStorageForAsset } from "@aiwa/assets/storage";
import { captureCreditsForJob } from "@aiwa/credits";
import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import {
  ProviderConfigurationError,
  ProviderRequestError,
  type AudioTranscriptionResult,
} from "@aiwa/providers";
import type { GroqProvider } from "@aiwa/providers/groq";

import { failJob } from "./process";

const MAX_OUTPUT_BYTES = 1_000_000;

function payloadObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeCaptionText(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function timestamp(seconds: number, separator: "," | "."): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${separator}${String(ms).padStart(3, "0")}`;
}

function ensureSubtitleOutputs(
  result: AudioTranscriptionResult,
  fallbackDurationSeconds: number,
): { srt: string; vtt: string; segmentCount: number } {
  const segments =
    result.segments && result.segments.length > 0
      ? result.segments
      : [
          {
            id: 0,
            start: 0,
            end: Math.max(
              0.001,
              result.durationSeconds ?? fallbackDurationSeconds,
            ),
            text: result.text,
          },
        ];

  const srt =
    result.srt ??
    segments
      .map(
        (segment, index) =>
          `${index + 1}\n${timestamp(segment.start, ",")} --> ${timestamp(segment.end, ",")}\n${safeCaptionText(segment.text)}\n`,
      )
      .join("\n");
  const vtt =
    result.vtt ??
    `WEBVTT\n\n${segments
      .map(
        (segment) =>
          `${timestamp(segment.start, ".")} --> ${timestamp(segment.end, ".")}\n${safeCaptionText(segment.text)}\n`,
      )
      .join("\n")}`;

  return { srt, vtt, segmentCount: segments.length };
}

function storageOptions() {
  const env = parseServerEnv();
  return {
    storageRoot: env.ASSET_STORAGE_ROOT,
    encryptionKey: env.STORAGE_ENCRYPTION_KEY,
    googleClientId: env.GOOGLE_DRIVE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
    onedriveClientId: env.ONEDRIVE_CLIENT_ID,
    onedriveClientSecret: env.ONEDRIVE_CLIENT_SECRET,
  };
}

export async function processTranscriptionJob(
  id: string,
  provider: GroqProvider,
): Promise<void> {
  const job = await db.generationJob.findUniqueOrThrow({
    where: { id },
    include: {
      providerModel: true,
      priceVersion: true,
      assets: {
        where: { status: "PENDING", mediaKind: "DOCUMENT" },
        orderBy: { generationOutputIndex: "asc" },
      },
    },
  });
  const payload = payloadObject(job.requestPayload);
  if (
    job.status !== "QUEUED" ||
    job.providerModel.mediaKind !== "VOICE" ||
    payload.task !== "transcription"
  )
    return;

  if (job.providerModel.enabled === false) {
    await failJob(
      id,
      "Selected transcription model was disabled before provider submission.",
      "QUEUED",
      "MODEL_DISABLED",
    );
    return;
  }

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: job.organizationId,
        userId: job.createdById,
      },
    },
    include: { organization: true, user: true },
  });
  if (
    !membership ||
    membership.user.disabledAt ||
    !membership.user.emailVerified ||
    membership.organization.status !== "ACTIVE" ||
    !hasOrganizationPermission(membership.role, "generation:create")
  ) {
    await failJob(
      id,
      "Workspace access changed before transcription.",
      "QUEUED",
      "WORKSPACE_ACCESS_CHANGED",
    );
    return;
  }

  const claimed = await db.generationJob.updateMany({
    where: { id, status: "QUEUED" },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });
  if (!claimed.count) return;

  const sourceAssetId =
    typeof payload.sourceAssetId === "string" ? payload.sourceAssetId : "";
  const source = await db.asset.findFirst({
    where: {
      id: sourceAssetId,
      organizationId: job.organizationId,
      status: "READY",
      mediaKind: { in: ["AUDIO", "VIDEO"] },
    },
  });
  if (
    !source ||
    source.durationMs === null ||
    source.durationMs <= 0 ||
    source.byteSize <= 0n ||
    source.byteSize > 25n * 1024n * 1024n
  ) {
    await failJob(
      id,
      "Source media is no longer available for transcription.",
      "SUBMITTED",
      "SOURCE_MEDIA_UNAVAILABLE",
    );
    return;
  }

  let audioBytes: Buffer;
  try {
    const sourceStorage = await resolveAssetStorageForAsset(
      db,
      source,
      storageOptions(),
    );
    audioBytes = await sourceStorage.read(
      source.objectKey,
      source.externalFileId ?? undefined,
    );
  } catch {
    await failJob(
      id,
      "Source media could not be read.",
      "SUBMITTED",
      "SOURCE_MEDIA_UNAVAILABLE",
    );
    return;
  }

  let result: AudioTranscriptionResult;
  try {
    result = await provider.transcribe({
      idempotencyKey: job.idempotencyKey,
      modelId: job.providerModel.providerModelId,
      audioBytes,
      filename: source.originalFilename ?? `${source.id}.media`,
      mimeType: source.mimeType,
      language: transcriptionLanguageHint(
        payload.language,
        payload.localeIntent,
      ),
      prompt: typeof payload.prompt === "string" ? payload.prompt : undefined,
    });
    if (!result.text.trim()) {
      throw new ProviderRequestError(
        "Transcription provider returned empty text.",
        false,
        { code: "INVALID_PROVIDER_RESPONSE", stage: "parsing" },
      );
    }
  } catch (error) {
    if (
      error instanceof ProviderConfigurationError ||
      (error instanceof ProviderRequestError && !error.retryable)
    ) {
      await failJob(
        id,
        error instanceof ProviderConfigurationError
          ? "Transcription provider is unavailable. Credits released."
          : "Provider rejected the transcription request. Credits released.",
        "SUBMITTED",
        error instanceof ProviderRequestError
          ? (error.code ?? "PROVIDER_REJECTED")
          : "PROVIDER_UNAVAILABLE",
      );
      return;
    }

    await db.generationJob.updateMany({
      where: { id, status: "SUBMITTED" },
      data: {
        status: "MANUAL_REVIEW",
        errorCode: "PROVIDER_OUTCOME_UNKNOWN",
        errorMessage:
          "Transcription provider outcome is unknown. Credits remain reserved to prevent duplicate billing.",
      },
    });
    return;
  }

  const transitioned = await db.generationJob.updateMany({
    where: { id, status: "SUBMITTED" },
    data: {
      status: "PROCESSING",
      providerRequestId: result.providerRequestId,
      errorCode: null,
      errorMessage: null,
    },
  });
  if (!transitioned.count) return;

  const fallbackDurationSeconds = source.durationMs / 1000;
  const subtitles = ensureSubtitleOutputs(result, fallbackDurationSeconds);
  const outputs = [
    Buffer.from(result.text.trim() + "\n", "utf8"),
    Buffer.from(subtitles.srt, "utf8"),
    Buffer.from(subtitles.vtt, "utf8"),
  ];
  if (
    outputs.some(
      (bytes) => bytes.byteLength <= 0 || bytes.byteLength > MAX_OUTPUT_BYTES,
    ) ||
    job.assets.length !== 3
  ) {
    await db.generationJob.updateMany({
      where: { id, status: "PROCESSING" },
      data: {
        status: "MANUAL_REVIEW",
        errorCode: "TRANSCRIPT_OUTPUT_INVALID",
        errorMessage:
          "Transcription completed but generated document outputs require operator review.",
      },
    });
    return;
  }

  const stored: Array<{
    assetId: string;
    storage: Awaited<ReturnType<typeof resolveAssetStorageForAsset>>;
    objectKey: string;
    externalFileId?: string;
    byteSize: bigint;
    sha256: string;
  }> = [];

  try {
    for (let index = 0; index < job.assets.length; index++) {
      const asset = job.assets[index]!;
      const storage = await resolveAssetStorageForAsset(
        db,
        asset,
        storageOptions(),
      );
      const resultStored = await storage.put(
        asset.objectKey,
        outputs[index]!,
        asset.mimeType,
      );
      stored.push({
        assetId: asset.id,
        storage,
        objectKey: asset.objectKey,
        externalFileId: resultStored.externalFileId,
        byteSize: resultStored.byteSize,
        sha256: resultStored.sha256,
      });
    }
  } catch {
    for (const item of stored) {
      await item.storage
        .delete(item.objectKey, item.externalFileId)
        .catch(() => undefined);
    }
    await db.generationJob.updateMany({
      where: { id, status: "PROCESSING" },
      data: {
        status: "MANUAL_REVIEW",
        errorCode: "STORAGE_WRITE_FAILED",
        errorMessage:
          "Transcription completed but document outputs could not be stored. Credits remain reserved for recovery.",
      },
    });
    return;
  }

  let committed = false;
  try {
    committed = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM GenerationJob WHERE id = ${id} FOR UPDATE`;
      const current = await tx.generationJob.findUniqueOrThrow({
        where: { id },
      });
      if (current.status !== "PROCESSING") return false;

      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { organizationId: job.organizationId },
      });
      await captureCreditsForJob(tx, {
        walletId: wallet.id,
        jobId: id,
        amountCredits: current.reservedCredits,
        idempotencyKey: `generation-capture-${id}`,
      });

      const readyAssetIds: string[] = [];
      for (const item of stored) {
        const pending = job.assets.find((asset) => asset.id === item.assetId)!;
        await finalizeAssetStorage(tx, {
          organizationId: job.organizationId,
          reservedBytes: pending.byteSize,
          actualBytes: item.byteSize,
        });
        const ready = await tx.asset.update({
          where: { id: item.assetId },
          data: {
            status: "READY",
            byteSize: item.byteSize,
            sha256: item.sha256,
            externalFileId: item.externalFileId ?? null,
          },
          select: { id: true },
        });
        readyAssetIds.push(ready.id);
      }

      const trustedBillableSeconds = Math.max(
        1,
        Math.ceil(source.durationMs! / 1000),
      );
      const actualUnits =
        job.priceVersion.pricingDimension === "SECOND"
          ? Number(
              (BigInt(trustedBillableSeconds) +
                BigInt(job.priceVersion.unitQuantity) -
                1n) /
                BigInt(job.priceVersion.unitQuantity),
            )
          : 1;
      const actualProviderCostMicroUsd =
        job.priceVersion.providerCostMicroUsd * BigInt(actualUnits);

      await tx.generationJob.update({
        where: { id },
        data: {
          status: "SUCCEEDED",
          actualUnits,
          actualProviderCostMicroUsd,
          providerCostBasis: "TRUSTED_MEDIA_DURATION",
          completedAt: new Date(),
          outputPayload: {
            task: "transcription",
            text: result.text,
            language: result.language ?? null,
            durationSeconds: result.durationSeconds ?? fallbackDurationSeconds,
            trustedDurationMs: source.durationMs,
            segmentCount: subtitles.segmentCount,
            assetIds: readyAssetIds,
          },
          errorCode: null,
          errorMessage: null,
        },
      });

      await tx.auditEvent.create({
        data: {
          organizationId: job.organizationId,
          actorUserId: job.createdById,
          action: "generation.succeeded",
          targetType: "GenerationJob",
          targetId: id,
          metadata: {
            task: "transcription",
            sourceAssetId: source.id,
            provider: job.providerModel.provider,
            providerModelId: job.providerModel.providerModelId,
            trustedDurationMs: source.durationMs,
            segmentCount: subtitles.segmentCount,
            actualProviderCostMicroUsd: actualProviderCostMicroUsd.toString(),
          },
        },
      });
      return true;
    });
  } catch {
    committed = false;
  }

  if (!committed) {
    for (const item of stored) {
      await item.storage
        .delete(item.objectKey, item.externalFileId)
        .catch(() => undefined);
    }
    const pending = await db.asset.aggregate({
      where: { generationJobId: id, status: "PENDING" },
      _sum: { byteSize: true },
    });
    const reserved = pending._sum.byteSize ?? 0n;
    if (reserved > 0n) {
      await db
        .$transaction(async (tx) => {
          const current = await tx.generationJob.findUnique({
            where: { id },
            select: { status: true, organizationId: true },
          });
          if (!current || current.status === "SUCCEEDED") return;
          await releaseAssetStorage(tx, {
            organizationId: current.organizationId,
            reservedBytes: reserved,
          });
          await tx.asset.updateMany({
            where: { generationJobId: id, status: "PENDING" },
            data: {
              status: "DELETED",
              byteSize: 0n,
              deletedAt: new Date(),
              purgeAfter: new Date(),
            },
          });
          if (current.status === "PROCESSING") {
            await tx.generationJob.update({
              where: { id },
              data: {
                status: "MANUAL_REVIEW",
                errorCode: "STORAGE_COMMIT_FAILED",
                errorMessage:
                  "Transcription completed but output commit failed. Credits remain reserved for operator reconciliation.",
              },
            });
          }
        })
        .catch(() => undefined);
    }
  }
}
