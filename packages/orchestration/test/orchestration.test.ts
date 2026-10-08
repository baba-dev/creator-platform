import { describe, expect, it } from "vitest";
import {
  validateWorkflowGraphDAG,
  computeCanonicalRequestHash,
  verifyStepApprovalGate,
  classifyIntentDeterministically,
  evaluateExecutableSteps,
  evaluateStepRecovery,
  createSafeWorkflowEvent,
  type WorkflowGraph,
  type WorkflowStepAction,
} from "../src/index";

describe("@aiwa/orchestration contracts & workflow engine", () => {
  it("enforces strict DAG properties and detects cycles / invalid dependencies", () => {
    const invalidWorkflow: WorkflowGraph = {
      id: "wf-1",
      threadId: "th-1",
      organizationId: "org-1",
      title: "Test Campaign",
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [
        {
          id: "step-1",
          task: "image-generation",
          title: "Image Concept",
          position: 0,
          status: "DRAFT",
          payload: { prompt: "Omani perfume" },
          dependencies: [
            {
              sourceStepId: "step-2", // depends on future step!
              outputIndex: 0,
              role: "VISUAL_REFERENCE",
            },
          ],
          outputs: [],
        },
        {
          id: "step-2",
          task: "video-generation",
          title: "Video Animate",
          position: 1,
          status: "DRAFT",
          payload: { prompt: "animate perfume bottle" },
          dependencies: [],
          outputs: [],
        },
      ],
    };

    const result = validateWorkflowGraphDAG(invalidWorkflow);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("does not precede it");

    // Correct valid workflow
    const validWorkflow: WorkflowGraph = {
      ...invalidWorkflow,
      steps: [
        {
          id: "step-1",
          task: "image-generation",
          title: "Image Concept",
          position: 0,
          status: "DRAFT",
          payload: { prompt: "Omani perfume" },
          dependencies: [],
          outputs: [],
        },
        {
          id: "step-2",
          task: "video-generation",
          title: "Video Animate",
          position: 1,
          status: "DRAFT",
          payload: { prompt: "animate perfume bottle" },
          dependencies: [
            {
              sourceStepId: "step-1",
              outputIndex: 0,
              role: "VISUAL_REFERENCE",
            },
          ],
          outputs: [],
        },
      ],
    };

    const validResult = validateWorkflowGraphDAG(validWorkflow);
    expect(validResult.valid).toBe(true);
  });

  it("verifies server-side cryptographic approval gate and rejects altered requests", () => {
    const payload = { prompt: "luxury perfume", ratio: "16:9" };
    const hash = computeCanonicalRequestHash({
      task: "image-generation",
      modelId: "seedream-5-0",
      payload,
      sourceAssetIds: ["asset-1"],
    });

    const approval = {
      stepId: "step-1",
      revision: 1,
      requestHash: hash,
      modelId: "seedream-5-0",
      priceVersionId: "pv-1",
      sourceAssetIds: ["asset-1"],
      actorId: "user-1",
      organizationId: "org-1",
      quoteToken: "token-1",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };

    // Valid check
    const valid = verifyStepApprovalGate({
      approval,
      currentStepVersion: 1,
      expectedRequestHash: hash,
      currentActorId: "user-1",
      currentOrgId: "org-1",
    });
    expect(valid.approved).toBe(true);

    // Mismatched actor
    const actorMismatch = verifyStepApprovalGate({
      approval,
      currentStepVersion: 1,
      expectedRequestHash: hash,
      currentActorId: "user-attacker",
      currentOrgId: "org-1",
    });
    expect(actorMismatch.approved).toBe(false);
    expect(actorMismatch.reason).toContain("Actor mismatch");

    // Altered payload hash
    const altered = verifyStepApprovalGate({
      approval,
      currentStepVersion: 1,
      expectedRequestHash: "altered-hash",
      currentActorId: "user-1",
      currentOrgId: "org-1",
    });
    expect(altered.approved).toBe(false);
    expect(altered.reason).toContain("payload or source assets have changed");
  });

  it("classifies intents deterministically into 9 distinct categories", () => {
    expect(
      classifyIntentDeterministically("What is my current balance?").intent,
    ).toBe("ANSWER");
    expect(
      classifyIntentDeterministically("Open the video studio").intent,
    ).toBe("NAVIGATE");
    expect(
      classifyIntentDeterministically("Transcribe this recording").intent,
    ).toBe("TOOL_ACTION");
    expect(
      classifyIntentDeterministically(
        "Make a campaign with images, video and voiceover",
      ).intent,
    ).toBe("MULTI_STEP");
    expect(
      classifyIntentDeterministically(
        "Suggest three concepts for our perfume launch",
      ).intent,
    ).toBe("EXPLORE");
    expect(classifyIntentDeterministically("Set ratio to 9:16").intent).toBe(
      "STATE_CHANGE",
    );
    expect(
      classifyIntentDeterministically("Generate a perfume bottle image").intent,
    ).toBe("SINGLE_ACTION");
    expect(
      classifyIntentDeterministically("Something completely obscure").intent,
    ).toBe("CLARIFY");
  });

  it("evaluates executable steps according to dependency satisfaction and user approvals", () => {
    const workflow: WorkflowGraph = {
      id: "wf-1",
      threadId: "th-1",
      organizationId: "org-1",
      title: "Perfume Campaign",
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [
        {
          id: "step-1",
          task: "image-generation",
          title: "Image Concept",
          position: 0,
          status: "SUCCEEDED",
          payload: { prompt: "Omani perfume" },
          dependencies: [],
          outputs: [{ outputIndex: 0, assetId: "asset-1" }],
        },
        {
          id: "step-2",
          task: "video-generation",
          title: "Video Animate",
          position: 1,
          status: "AWAITING_APPROVAL",
          payload: { prompt: "animate bottle" },
          dependencies: [
            {
              sourceStepId: "step-1",
              outputIndex: 0,
              role: "VISUAL_REFERENCE",
            },
          ],
          outputs: [],
          approvedAt: new Date().toISOString(),
        },
      ],
    };

    const candidates = evaluateExecutableSteps(workflow);
    const step2Candidate = candidates.find((c) => c.step.id === "step-2");
    expect(step2Candidate?.canExecute).toBe(true);
  });

  it("handles failure recovery safely without blind resubmission", () => {
    const stepWithJob: WorkflowStepAction = {
      id: "step-1",
      task: "image-generation",
      title: "Step 1",
      position: 0,
      status: "RUNNING",
      jobId: "job-12345",
      payload: {},
      dependencies: [],
      outputs: [],
    };
    expect(evaluateStepRecovery(stepWithJob).recommendedAction).toBe(
      "REPLAY_EXISTING_JOB",
    );

    const crashedInAdmission: WorkflowStepAction = {
      id: "step-2",
      task: "video-generation",
      title: "Step 2",
      position: 1,
      status: "ADMITTING",
      payload: {},
      dependencies: [],
      outputs: [],
    };
    expect(evaluateStepRecovery(crashedInAdmission).recommendedAction).toBe(
      "MARK_MANUAL_REVIEW",
    );
  });

  it("redacts sensitive fields in workflow events", () => {
    const event = createSafeWorkflowEvent({
      id: "ev-1",
      workflowId: "wf-1",
      stepId: "step-1",
      type: "STEP_STARTED",
      payload: {
        normalParam: "safe-value",
        apiKey: "sk-secret123",
        customerUrl: "https://private.domain/media.mp4",
      },
    });

    expect(event.payload.normalParam).toBe("safe-value");
    expect(event.payload.apiKey).toBe("[REDACTED]");
    expect(event.payload.customerUrl).toBe("[REDACTED]");
  });
});
