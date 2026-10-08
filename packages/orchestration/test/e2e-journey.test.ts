import { describe, expect, it } from "vitest";
import {
  compileCreativePlan,
  validateWorkflowGraphDAG,
  evaluateExecutableSteps,
  evaluateStepRecovery,
  computeCanonicalRequestHash,
  verifyStepApprovalGate,
  type WorkflowGraph,
} from "@aiwa/orchestration";

describe("Creators Conversation v3 End-to-End Orchestrated Journey", () => {
  it("compiles a complex multi-step campaign brief (image -> video -> narration) into a validated DAG", () => {
    const userPrompt =
      "Create a 15-second luxury perfume advertisement for Oman. Use my bottle photograph, generate concepts, animate the concept, and create an Omani Arabic voiceover.";

    // Stage B Plan Compilation
    const plan = compileCreativePlan({ userPrompt, locale: "ar-OM" });
    expect(plan.steps.length).toBe(3);
    expect(plan.steps[0]!.task).toBe("image-generation");
    expect(plan.steps[1]!.task).toBe("video-generation");
    expect(plan.steps[2]!.task).toBe("speech-synthesis");

    // Convert into workflow graph
    const workflow: WorkflowGraph = {
      id: "wf-perfume-e2e",
      threadId: "th-e2e",
      organizationId: "org-muscat",
      title: plan.title,
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [
        {
          id: "step-img-1",
          task: "image-generation",
          title: plan.steps[0]!.title,
          position: 0,
          status: "SUCCEEDED",
          payload: plan.steps[0]!.payload,
          dependencies: [],
          outputs: [
            {
              outputIndex: 0,
              assetId: "asset-perfume-concept-2",
              mimeType: "image/png",
            },
          ],
        },
        {
          id: "step-vid-2",
          task: "video-generation",
          title: plan.steps[1]!.title,
          position: 1,
          status: "AWAITING_APPROVAL",
          payload: plan.steps[1]!.payload,
          dependencies: [
            {
              sourceStepId: "step-img-1",
              outputIndex: 0,
              role: "FIRST_FRAME",
            },
          ],
          outputs: [],
          approvedAt: new Date().toISOString(),
          quote: {
            quoteId: "q",
            quoteToken: "signed",
            expiresAt: new Date(Date.now() + 60000).toISOString(),
            modelId: "m",
            provider: "byteplus",
            priceVersionId: "p",
            pricingDimension: "REQUEST",
            unitQuantity: 1,
            estimatedCredits: "1",
            maximumChargeCredits: "1",
            requestHash: "a".repeat(64),
          },
        },
        {
          id: "step-aud-3",
          task: "speech-synthesis",
          title: plan.steps[2]!.title,
          position: 2,
          status: "AWAITING_APPROVAL",
          payload: plan.steps[2]!.payload,
          dependencies: [],
          outputs: [],
          approvedAt: new Date().toISOString(),
          quote: {
            quoteId: "q",
            quoteToken: "signed",
            expiresAt: new Date(Date.now() + 60000).toISOString(),
            modelId: "m",
            provider: "byteplus",
            priceVersionId: "p",
            pricingDimension: "REQUEST",
            unitQuantity: 1,
            estimatedCredits: "1",
            maximumChargeCredits: "1",
            requestHash: "a".repeat(64),
          },
        },
      ],
    };

    // 1. Validate DAG integrity
    const dagResult = validateWorkflowGraphDAG(workflow);
    expect(dagResult.valid).toBe(true);

    // 2. Evaluate executable steps: both step 2 (video) and step 3 (audio) should be admitted
    const candidates = evaluateExecutableSteps(workflow);
    const videoCandidate = candidates.find((c) => c.step.id === "step-vid-2");
    const audioCandidate = candidates.find((c) => c.step.id === "step-aud-3");

    expect(videoCandidate?.canExecute).toBe(true);
    expect(audioCandidate?.canExecute).toBe(true);
  });

  it("verifies financial gate and idempotency recovery on interrupted execution", () => {
    const payload = { prompt: "Luxury Omani Frankincense Perfume" };
    const hash = computeCanonicalRequestHash({
      task: "image-generation",
      modelId: "seedream-5-0",
      payload,
      sourceAssetIds: [],
    });

    const quote = {
      quoteId: "q-12345",
      quoteToken: "token-secure-jwt",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      modelId: "seedream-5-0",
      provider: "byteplus",
      priceVersionId: "pv-om-1",
      pricingDimension: "REQUEST" as const,
      unitQuantity: 1,
      estimatedCredits: "50",
      maximumChargeCredits: "50",
      requestHash: hash,
    };

    // Server-side approval check
    const gate = verifyStepApprovalGate({
      approval: {
        stepId: "step-1",
        revision: 1,
        requestHash: hash,
        modelId: quote.modelId,
        priceVersionId: quote.priceVersionId,
        sourceAssetIds: [],
        actorId: "user-creator",
        organizationId: "org-1",
        quoteToken: quote.quoteToken,
        expiresAt: quote.expiresAt,
      },
      currentStepVersion: 1,
      expectedRequestHash: hash,
      currentActorId: "user-creator",
      currentOrgId: "org-1",
    });
    expect(gate.approved).toBe(true);

    // Recovery test: Step with recorded jobId replays existing job without double spend
    const recoveryWithJob = evaluateStepRecovery({
      id: "step-1",
      task: "image-generation",
      title: "Perfume",
      position: 0,
      status: "RUNNING",
      jobId: "job-canonical-99",
      payload: {},
      dependencies: [],
      outputs: [],
    });
    expect(recoveryWithJob.recommendedAction).toBe("REPLAY_EXISTING_JOB");

    // Recovery test: Step crashed during admission triggers MANUAL_REVIEW to prevent double spend
    const recoveryAdmissionCrash = evaluateStepRecovery({
      id: "step-1",
      task: "image-generation",
      title: "Perfume",
      position: 0,
      status: "ADMITTING",
      payload: {},
      dependencies: [],
      outputs: [],
    });
    expect(recoveryAdmissionCrash.recommendedAction).toBe("MARK_MANUAL_REVIEW");
  });
});
