import { createHash } from "node:crypto";
import { hasOrganizationPermission } from "@aiwa/authz";
import { calculateBillableUnits, countBillableCharacters } from "@aiwa/credits";
import { db, type Prisma } from "@aiwa/db";
import {
  createVoiceJob,
  GenerationError,
  issueGenerationQuote,
  priceCredits,
  resolvePresetVoice,
  verifyGenerationQuote,
} from "@aiwa/generation";
import { checkMemberSpendingBudget } from "@aiwa/organizations";
import { NextResponse } from "next/server";
import { z } from "zod";
import { deterministicUuid } from "@/lib/idempotency";
import { formatBaisa } from "@/lib/format-baisa";
import { publicCostBreakdown } from "@/lib/customer-cost-breakdown";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const batchSynthesizeSchema = z
  .object({
    blockIds: z
      .array(z.string().min(1).max(64))
      .max(25)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Block ids must be unique.",
      })
      .optional(),
    mode: z.enum(["quote", "generate"]).default("generate"),
    idempotencyKey: z.uuid(),
    quoteToken: z.string().min(1).max(2048).optional(),
  })
  .superRefine((value, context) => {
    if (value.mode === "generate" && !value.quoteToken)
      context.addIssue({
        code: "custom",
        message: "A fresh batch quote is required.",
      });
  });

interface ScriptSceneBlock {
  id: string;
  type: string;
  character?: string;
  parenthetical?: string;
  text: string;
  audioJobId?: string;
  voiceKey?: string;
}

interface ScriptContentData {
  scenes?: ScriptSceneBlock[];
  voiceAssignments?: Record<string, { voiceKey: string; speechRate?: number }>;
}

function batchFingerprint(input: {
  scriptId: string;
  revision: number;
  modelId: string;
  priceVersionId: string;
  blocks: Array<{
    id: string;
    text: string;
    voiceKey: string;
    speechRate: number;
  }>;
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ scriptId: string }> },
) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const { scriptId } = await params;

  try {
    const script = await db.script.findUnique({ where: { id: scriptId } });
    if (!script)
      return NextResponse.json({ error: "Script not found." }, { status: 404 });

    const membership = await db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: script.organizationId,
          userId: session.user.id,
        },
      },
      include: { organization: true },
    });
    if (
      !membership ||
      membership.organization.status !== "ACTIVE" ||
      !hasOrganizationPermission(membership.role, "generation:create")
    )
      return NextResponse.json({ error: "Access denied." }, { status: 403 });

    const input = batchSynthesizeSchema.parse(
      await request.json().catch(() => ({})),
    );
    const content = (script.content as ScriptContentData) || {};
    const scenes = content.scenes || [];
    const voiceAssignments = content.voiceAssignments || {};
    const dialogueBlocks = scenes.filter((block) => {
      if (block.type !== "dialogue" || !block.text.trim()) return false;
      return input.blockIds?.length ? input.blockIds.includes(block.id) : true;
    });
    if (!dialogueBlocks.length)
      return NextResponse.json(
        { error: "No eligible dialogue blocks found to synthesize." },
        { status: 400 },
      );
    if (dialogueBlocks.length > 25)
      return NextResponse.json(
        {
          error:
            "Batch synthesis is limited to 25 dialogue lines. Select a smaller scene range.",
        },
        { status: 400 },
      );

    const now = new Date();
    const voiceModel = await db.providerModel.findFirst({
      where: {
        mediaKind: "VOICE",
        provider: "BYTEPLUS",
        providerModelId: "seed-tts-2.0",
        enabled: true,
      },
      include: {
        priceVersions: {
          where: {
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
          orderBy: { effectiveFrom: "desc" },
          take: 1,
        },
      },
    });
    const price = voiceModel?.priceVersions[0];
    if (!voiceModel || !price)
      return NextResponse.json(
        { error: "Seed Speech TTS 2.0 is not configured." },
        { status: 503 },
      );

    const resolvedBlocks = dialogueBlocks.map((block) => {
      const charName = (block.character || "").toUpperCase().trim();
      const assignment = voiceAssignments[charName];
      let voiceKey = assignment?.voiceKey || block.voiceKey || "jasper";
      const speechRate = assignment?.speechRate ?? 1;
      try {
        resolvePresetVoice(voiceKey, "seed-tts-2.0");
      } catch {
        voiceKey = "jasper";
      }
      return { block, voiceKey, speechRate };
    });

    let maximumCredits = 0n;
    for (const row of resolvedBlocks) {
      const characters = countBillableCharacters(row.block.text.trim());
      const units =
        price.pricingDimension === "CHARACTER"
          ? calculateBillableUnits(
              BigInt(characters),
              BigInt(price.unitQuantity ?? 1000),
            )
          : 1n;
      maximumCredits += priceCredits({
        ...price,
        providerCostMicroUsd: price.providerCostMicroUsd * units,
      });
    }

    const hash = batchFingerprint({
      scriptId,
      revision: script.revision,
      modelId: voiceModel.id,
      priceVersionId: price.id,
      blocks: resolvedBlocks.map(({ block, voiceKey, speechRate }) => ({
        id: block.id,
        text: block.text,
        voiceKey,
        speechRate,
      })),
    });
    const quoteContext = {
      organizationId: script.organizationId,
      userId: session.user.id,
      modelId: voiceModel.id,
      priceVersionId: price.id,
      parameters: {
        kind: "SCRIPT_TTS_BATCH",
        batchHash: hash,
        blockCount: resolvedBlocks.length,
      },
    };

    if (input.mode === "quote") {
      const quote = issueGenerationQuote(quoteContext, maximumCredits, now);
      const customerBaisa = maximumCredits / price.creditsPerBaisa;
      const totalCharacters = resolvedBlocks.reduce(
        (sum, row) => sum + countBillableCharacters(row.block.text.trim()), 0,
      );
      return NextResponse.json({
        quote: {
          ...quote,
          estimatedCredits: maximumCredits.toString(),
          maximumChargeCredits: maximumCredits.toString(),
          reservationCredits: maximumCredits.toString(),
          estimatedOmr: formatBaisa(customerBaisa),
          maximumChargeOmr: formatBaisa(customerBaisa),
          creditsPerBaisa: price.creditsPerBaisa.toString(),
          pricingDimension: price.pricingDimension,
          settlement: "MULTI_STEP_ESTIMATE",
          estimatedUsage: { unit: "CHARACTER", quantity: String(totalCharacters), isEstimate: false },
          pricingBreakdown: publicCostBreakdown(
            customerBaisa, customerBaisa,
            { baisaNumerator: price.fxBaisaNumerator, baisaDenominator: price.fxBaisaDenominator },
          ),
          blockCount: resolvedBlocks.length,
          displayName: voiceModel.displayName,
        },
      });
    }

    try {
      verifyGenerationQuote(
        input.quoteToken,
        quoteContext,
        maximumCredits,
        now,
      );
    } catch (error) {
      throw new GenerationError(
        error instanceof Error ? error.message : "Batch quote is invalid.",
        409,
      );
    }

    const budget = await checkMemberSpendingBudget({
      organizationId: script.organizationId,
      userId: session.user.id,
      proposedCredits: maximumCredits,
      date: now,
    });
    const wallet = await db.wallet.findUnique({
      where: { organizationId: script.organizationId },
      select: { balanceCache: true },
    });
    if (!budget.canSpend)
      throw new GenerationError(
        "Batch synthesis exceeds your monthly spending cap.",
        409,
      );
    if (!wallet || wallet.balanceCache < maximumCredits)
      throw new GenerationError(
        "Workspace balance is insufficient for this batch.",
        409,
      );

    const queuedJobs: Array<{
      blockId: string;
      jobId: string;
      text: string;
      voiceKey: string;
    }> = [];
    const failedBlocks: Array<{ blockId: string; error: string }> = [];

    for (const row of resolvedBlocks) {
      const { block, voiceKey, speechRate } = row;
      const jobKey = deterministicUuid(
        [
          "script-batch-voice-v2",
          script.id,
          block.id,
          voiceModel.id,
          price.id,
          voiceKey,
          String(speechRate),
          block.text,
        ].join("\u0000"),
      );
      try {
        const job = await createVoiceJob(session.user.id, {
          organizationId: script.organizationId,
          projectId: script.projectId,
          modelId: voiceModel.id,
          priceVersionId: price.id,
          idempotencyKey: jobKey,
          text: block.text,
          voiceKey,
          speechRate,
          format: "mp3",
        });
        queuedJobs.push({
          blockId: block.id,
          jobId: job.id,
          text: block.text,
          voiceKey,
        });
      } catch (error) {
        failedBlocks.push({
          blockId: block.id,
          error:
            error instanceof Error
              ? error.message
              : "Voice synthesis could not be queued.",
        });
      }
    }

    const attachmentConflicts: string[] = [];
    let revision = script.revision;
    if (queuedJobs.length) {
      revision = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM Script WHERE id = ${scriptId} FOR UPDATE`;
        const current = await tx.script.findUniqueOrThrow({
          where: { id: scriptId },
        });
        const currentContent = (current.content as ScriptContentData) || {};
        const currentScenes = currentContent.scenes || [];
        const jobs = new Map(queuedJobs.map((job) => [job.blockId, job]));
        let changed = false;
        const updatedScenes = currentScenes.map((scene) => {
          const queued = jobs.get(scene.id);
          if (!queued) return scene;
          if (scene.text !== queued.text) {
            attachmentConflicts.push(scene.id);
            return scene;
          }
          changed = true;
          return {
            ...scene,
            audioJobId: queued.jobId,
            voiceKey: queued.voiceKey,
          };
        });
        if (!changed) return current.revision;
        const updated = await tx.script.update({
          where: { id: scriptId },
          data: {
            content: {
              ...currentContent,
              scenes: updatedScenes,
            } as unknown as Prisma.InputJsonValue,
            revision: { increment: 1 },
          },
          select: { revision: true },
        });
        return updated.revision;
      });
    }

    const partial = failedBlocks.length > 0 || attachmentConflicts.length > 0;
    const status = queuedJobs.length === 0 ? 422 : partial ? 207 : 202;
    return NextResponse.json(
      {
        jobs: queuedJobs.map(({ blockId, jobId }) => ({ blockId, jobId })),
        queuedCount: queuedJobs.length,
        failed: failedBlocks,
        failedCount: failedBlocks.length,
        attachmentConflicts,
        partial,
        revision,
        authorizedCredits: maximumCredits.toString(),
      },
      { status },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "Invalid batch parameters.", issues: error.issues },
        { status: 400 },
      );
    if (error instanceof GenerationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    return NextResponse.json(
      { error: "Batch voice synthesis failed." },
      { status: 500 },
    );
  }
}
