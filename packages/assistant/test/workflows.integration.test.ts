import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@aiwa/db";
import {
  preparePixelWorkflow,
  quotePixelAction,
  executePixelAction,
  cancelPixelWorkflow,
} from "../src/workflows";
import { savePixelPreferences } from "../src/preferences";

const enabled = process.env.GENERATION_INTEGRATION_TEST === "true";
const key = `pixel-${randomUUID()}`;
const userId = `${key}-user`,
  organizationId = `${key}-org`,
  threadId = `${key}-thread`,
  modelId = `${key}-model`;
const ctx = {
  userId,
  organizationId,
  threadId,
  organizationSlug: key,
  idempotencyKey: randomUUID(),
};

describe.skipIf(!enabled)("Pixel actions with MariaDB", () => {
  beforeAll(async () => {
    await db.user.create({
      data: {
        id: userId,
        email: `${key}@example.invalid`,
        name: "Pixel test",
        emailVerified: true,
      },
    });
    await db.organization.create({
      data: {
        id: organizationId,
        slug: key,
        name: "Pixel test",
        ownerUserId: userId,
        memberships: { create: { userId, role: "ORGANIZATION_OWNER" } },
        wallet: { create: { balanceCache: 10000n } },
      },
    });
    await db.chatThread.create({
      data: {
        id: threadId,
        organizationId,
        createdById: userId,
        title: "Pixel",
        threadType: "PIXEL",
        modelId: "pixel-local",
      },
    });
    await db.providerModel.create({
      data: {
        id: modelId,
        provider: "BYTEPLUS",
        providerModelId: "seedream-5-0-260128",
        displayName: "Pixel test model",
        description: "Test",
        mediaKind: "IMAGE",
        enabled: true,
        capabilities: { "aspectRatio:1:1": true, "resolution:2K": true },
        priceVersions: {
          create: {
            providerCostMicroUsd: 54000n,
            customerCredits: 84n,
            fxBaisaNumerator: 769n,
            fxBaisaDenominator: 2n,
            targetMarginBps: 2500,
            creditsPerBaisa: 3n,
            effectiveFrom: new Date(0),
            createdById: userId,
          },
        },
      },
    });
  });
  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { organizationId } });
    await db.chatThread.deleteMany({ where: { id: threadId } });
    await db.asset.deleteMany({ where: { organizationId } });
    await db.ledgerEntry.deleteMany({ where: { wallet: { organizationId } } });
    await db.generationJob.deleteMany({ where: { organizationId } });
    await db.modelPriceVersion.deleteMany({
      where: { providerModelId: modelId },
    });
    await db.providerModel.deleteMany({ where: { id: modelId } });
    await db.pixelPreference.deleteMany({ where: { organizationId } });
    await db.assetStorageUsage.deleteMany({ where: { organizationId } });
    await db.wallet.deleteMany({ where: { organizationId } });
    await db.membership.deleteMany({ where: { organizationId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it("persists one draft and reserves once under concurrent approval", async () => {
    const input = {
      title: "Product campaign",
      steps: [
        { kind: "IMAGE", modelId, prompt: "A simple product photograph" },
      ],
    };
    const [first, replay] = await Promise.all([
      preparePixelWorkflow(ctx, input),
      preparePixelWorkflow(ctx, input),
    ]);
    expect(first.workflowId).toBe(replay.workflowId);
    const action = await db.pixelAction.findFirstOrThrow({
      where: { workflowId: first.workflowId },
    });
    const quote = await quotePixelAction(ctx, action.id);
    const [a, b] = await Promise.all([
      executePixelAction(ctx, action.id, quote.quoteId),
      executePixelAction(ctx, action.id, quote.quoteId),
    ]);
    expect(a.jobId).toBe(b.jobId);
    expect(await db.generationJob.count({ where: { organizationId } })).toBe(1);
    expect(
      await db.ledgerEntry.count({
        where: { referenceId: a.jobId, type: "RESERVATION" },
      }),
    ).toBe(1);
    expect(
      await db.auditEvent.count({
        where: { organizationId, action: "pixel.action.approved" },
      }),
    ).toBe(1);
    expect(
      await db.auditEvent.count({
        where: { organizationId, action: "pixel.action.submitted" },
      }),
    ).toBe(1);
    await cancelPixelWorkflow(ctx, first.workflowId);
    expect(
      (await db.generationJob.findUniqueOrThrow({ where: { id: a.jobId } }))
        .status,
    ).toBe("QUEUED");
  });

  it("keeps preferences scoped and forgets them explicitly", async () => {
    await savePixelPreferences(ctx, { enabled: true, language: "Hinglish" });
    expect(
      await db.pixelPreference.count({ where: { organizationId, userId } }),
    ).toBe(1);
    await savePixelPreferences(ctx, { enabled: false });
    expect(
      await db.pixelPreference.count({ where: { organizationId, userId } }),
    ).toBe(0);
  });
});
