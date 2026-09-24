import { describe, expect, it } from "vitest";
import { generationCompletedEmail, senderForKind } from "../src/index";
import { classifySmtpFailure } from "../src/transport";

describe("mail helpers", () => {
  it("keeps sender identities separated", () => {
    const env = {
      MAIL_SECURITY_FROM_ADDRESS: "security@aiwamediagroup.com",
      MAIL_ROUTINE_FROM_ADDRESS: "creator-tool@aiwamediagroup.com",
    } as never;
    expect(senderForKind(env, "SECURITY")).toBe("security@aiwamediagroup.com");
    expect(senderForKind(env, "ROUTINE")).toBe(
      "creator-tool@aiwamediagroup.com",
    );
  });

  it("builds idempotent routine generation mail", () => {
    const draft = generationCompletedEmail({
      to: "USER@EXAMPLE.COM ",
      assetUrl: "https://creator.aiwamediagroup.com/assets/a",
      userId: "u1",
      organizationId: "o1",
      generationJobId: "j1",
    });
    expect(draft.kind).toBe("ROUTINE");
    expect(draft.idempotencyKey).toBe("generation-completed:j1");
  });

  it("treats 5xx SMTP responses as permanent", () => {
    const error = Object.assign(new Error("rejected"), { smtpCode: 550 });
    expect(classifySmtpFailure(error).retryable).toBe(false);
  });
});
