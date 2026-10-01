import { describe, expect, it } from "vitest";

import {
  normalizeVideoRequest,
  validateVideoModelRequest,
  videoRequestSchema,
  videoRequestV2Schema,
} from "../src/video-contract";

const requestIdentity = {
  organizationId: "org-1",
  modelId: "model-1",
  priceVersionId: "price-1",
  idempotencyKey: "123e4567-e89b-42d3-a456-426614174100",
};

describe("Seedance video request contract", () => {
  it("normalizes historical first/last-frame requests without changing their intent", () => {
    const parsed = videoRequestSchema.parse({
      ...requestIdentity,
      prompt: "Turn from profile to camera",
      aspectRatio: "adaptive",
      resolution: "720p",
      durationSeconds: 5,
      firstFrameAssetId: "asset-first",
      lastFrameAssetId: "asset-last",
    });
    const normalized = normalizeVideoRequest(parsed);
    expect(normalized.schemaVersion).toBe(2);
    expect(normalized.workflow).toBe("FIRST_LAST_FRAME");
    expect(normalized.sources).toEqual([
      { assetId: "asset-first", role: "FIRST_FRAME", position: 0 },
      { assetId: "asset-last", role: "LAST_FRAME", position: 1 },
    ]);
  });

  it("normalizes historical reference-video requests as reference workflows", () => {
    const parsed = videoRequestSchema.parse({
      ...requestIdentity,
      idempotencyKey: "123e4567-e89b-42d3-a456-426614174101",
      prompt: "Match this camera move",
      aspectRatio: "16:9",
      resolution: "720p",
      durationSeconds: 5,
      referenceVideoAssetId: "asset-video",
    });
    expect(normalizeVideoRequest(parsed)).toMatchObject({
      workflow: "REFERENCE",
      sources: [
        { assetId: "asset-video", role: "REFERENCE_VIDEO", position: 0 },
      ],
    });
  });

  it("fails closed on duplicate assets or duplicate source positions", () => {
    const duplicate = videoRequestV2Schema.safeParse({
      ...requestIdentity,
      idempotencyKey: "123e4567-e89b-42d3-a456-426614174102",
      schemaVersion: 2,
      workflow: "REFERENCE",
      prompt: "Use these references",
      aspectRatio: "16:9",
      resolution: "720p",
      durationSeconds: 5,
      sources: [
        { assetId: "asset-1", role: "REFERENCE_IMAGE", position: 0 },
        { assetId: "asset-1", role: "REFERENCE_VIDEO", position: 1 },
      ],
    });
    expect(duplicate.success).toBe(false);

    const duplicatePosition = videoRequestV2Schema.safeParse({
      ...requestIdentity,
      idempotencyKey: "123e4567-e89b-42d3-a456-426614174103",
      schemaVersion: 2,
      workflow: "REFERENCE",
      prompt: "Use these references",
      aspectRatio: "16:9",
      resolution: "720p",
      durationSeconds: 5,
      sources: [
        { assetId: "asset-1", role: "REFERENCE_IMAGE", position: 0 },
        { assetId: "asset-2", role: "REFERENCE_VIDEO", position: 0 },
      ],
    });
    expect(duplicatePosition.success).toBe(false);
  });

  it("requires adaptive source-preserving edit inputs", () => {
    const invalid = videoRequestV2Schema.safeParse({
      ...requestIdentity,
      idempotencyKey: "123e4567-e89b-42d3-a456-426614174104",
      schemaVersion: 2,
      workflow: "EDIT",
      prompt: "Replace the background",
      aspectRatio: "16:9",
      resolution: "720p",
      durationSeconds: 5,
      sources: [{ assetId: "source", role: "SOURCE_VIDEO", position: 0 }],
    });
    expect(invalid.success).toBe(false);

    const valid = videoRequestV2Schema.safeParse({
      ...requestIdentity,
      idempotencyKey: "123e4567-e89b-42d3-a456-426614174105",
      schemaVersion: 2,
      workflow: "EDIT",
      prompt: "Replace the background",
      aspectRatio: "adaptive",
      resolution: "720p",
      durationSeconds: -1,
      sources: [{ assetId: "source", role: "SOURCE_VIDEO", position: 0 }],
    });
    expect(valid.success).toBe(true);
  });

  it("keeps Draft and Draft-final contracts distinct", () => {
    expect(
      videoRequestV2Schema.safeParse({
        ...requestIdentity,
        idempotencyKey: "123e4567-e89b-42d3-a456-426614174106",
        schemaVersion: 2,
        workflow: "DRAFT",
        prompt: "A cinematic reveal",
        aspectRatio: "16:9",
        resolution: "720p",
        durationSeconds: 8,
        sources: [],
      }).success,
    ).toBe(false);

    const final = videoRequestV2Schema.parse({
      ...requestIdentity,
      idempotencyKey: "123e4567-e89b-42d3-a456-426614174107",
      schemaVersion: 2,
      workflow: "DRAFT_FINAL",
      prompt: "",
      aspectRatio: "16:9",
      resolution: "1080p",
      durationSeconds: 5,
      sources: [],
      sourceDraftJobId: "draft-job",
    });
    expect(final.workflow).toBe("DRAFT_FINAL");
  });

  it("enforces model ranges, reference ceilings, audio-only policy, MOV and Draft capabilities", () => {
    const request = videoRequestV2Schema.parse({
      ...requestIdentity,
      idempotencyKey: "123e4567-e89b-42d3-a456-426614174108",
      schemaVersion: 2,
      workflow: "REFERENCE",
      prompt: "Match these guides",
      aspectRatio: "16:9",
      resolution: "720p",
      durationSeconds: 8,
      sources: [{ assetId: "audio", role: "REFERENCE_AUDIO", position: 0 }],
    });
    const limited = {
      "resolution:720p": true,
      "aspectRatio:16:9": true,
      generateAudio: true,
      referenceImages: true,
      referenceVideo: true,
      referenceAudio: true,
      maxReferenceImages: 9,
      maxReferenceVideos: 3,
      maxReferenceAudio: 3,
      audioOnlyReference: false,
      minimumDurationSeconds: 4,
      maximumDurationSeconds: 15,
      returnLastFrame: true,
    };
    expect(
      validateVideoModelRequest(
        "dreamina-seedance-2-0-mini-260615",
        limited,
        request,
      ),
    ).toMatch(/requires an image or video/i);

    const director = {
      ...limited,
      audioOnlyReference: true,
      maximumDurationSeconds: 30,
      maxReferenceImages: 30,
      maxReferenceVideos: 10,
      maxReferenceAudio: 10,
      draftMode: true,
      outputFormatMov: true,
      editVideo: true,
      extendVideo: true,
    };
    expect(
      validateVideoModelRequest(
        "dreamina-seedance-2-5-260628",
        director,
        request,
      ),
    ).toBeNull();
  });
});
