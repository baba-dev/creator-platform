import { describe, expect, it } from "vitest";

import {
  adminTextEstimatorForProvider,
  initialTextUsageTiers,
} from "./admin-model-pricing";

describe("admin model pricing helpers", () => {
  it("uses generic text-token-v1 for external providers", () => {
    expect(adminTextEstimatorForProvider("GROQ")).toBe("text-token-v1");
    expect(adminTextEstimatorForProvider("GEMINI")).toBe("text-token-v1");
    expect(adminTextEstimatorForProvider("CLOUDFLARE")).toBe("text-token-v1");
    expect(adminTextEstimatorForProvider("BYTEPLUS")).toBe(
      "byteplus-text-v1",
    );
  });

  it("loads existing external text-token-v1 tiers without replacing them", () => {
    const tiers = [
      {
        maxPromptTokens: 131072,
        inputMicroUsdPerMillionTokens: "150000",
        outputMicroUsdPerMillionTokens: "600000",
      },
    ];
    expect(
      initialTextUsageTiers(
        {
          estimator: "text-token-v1",
          tiers,
        },
        "999999",
      ),
    ).toEqual(tiers);
  });

  it("keeps legacy BytePlus tiers loadable and falls back only when absent", () => {
    const bytePlusTiers = [
      {
        maxPromptTokens: 262144,
        inputMicroUsdPerMillionTokens: "500000",
        outputMicroUsdPerMillionTokens: "3000000",
      },
    ];
    expect(
      initialTextUsageTiers(
        {
          estimator: "byteplus-text-v1",
          tiers: bytePlusTiers,
        },
        "1",
      ),
    ).toEqual(bytePlusTiers);

    expect(initialTextUsageTiers(null, "2000")).toEqual([
      {
        maxPromptTokens: 262144,
        inputMicroUsdPerMillionTokens: "2000000",
        cachedInputMicroUsdPerMillionTokens: "2000000",
        outputMicroUsdPerMillionTokens: "2000000",
      },
    ]);
  });
});
