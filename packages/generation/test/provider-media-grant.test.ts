import { describe, expect, it } from "vitest";
import {
  issueProviderMediaGrant,
  issueProviderToolMediaGrant,
  verifyProviderMediaGrant,
  verifyProviderToolMediaGrant,
} from "../src/provider-media-grant";

const secret = "media-grants-need-a-private-secret-of-sufficient-length";
const context = {
  secret,
  jobId: "job1",
  assetId: "asset1",
  now: 1_780_000_000_000,
};

describe("provider media grants", () => {
  it("binds the token to one job, one asset and an expiry", () => {
    const token = issueProviderMediaGrant(context);
    expect(verifyProviderMediaGrant({ ...context, token })).toBe(true);
    expect(
      verifyProviderMediaGrant({ ...context, assetId: "asset2", token }),
    ).toBe(false);
    expect(verifyProviderMediaGrant({ ...context, jobId: "job2", token })).toBe(
      false,
    );
    expect(
      verifyProviderMediaGrant({
        ...context,
        now: context.now + 3 * 60 * 60 * 1000 + 1,
        token,
      }),
    ).toBe(false);
    const tampered = token.slice(0, -1) + (token.endsWith("0") ? "1" : "0");
    expect(verifyProviderMediaGrant({ ...context, token: tampered })).toBe(
      false,
    );
  });

  it("rejects excessively long grants and future forged timestamps", () => {
    expect(() =>
      issueProviderMediaGrant({ ...context, ttlMs: 4 * 60 * 60 * 1000 }),
    ).toThrow();
    const token = issueProviderMediaGrant({
      ...context,
      now: context.now + 30_000,
    });
    expect(verifyProviderMediaGrant({ ...context, token })).toBe(false);
  });
});

describe("provider tool media grants", () => {
  it("uses a separate namespace bound to one execution and asset", () => {
    const token = issueProviderToolMediaGrant({
      secret,
      executionId: "execution1",
      assetId: "asset1",
      now: context.now,
    });
    expect(
      verifyProviderToolMediaGrant({
        secret,
        executionId: "execution1",
        assetId: "asset1",
        now: context.now,
        token,
      }),
    ).toBe(true);
    expect(
      verifyProviderToolMediaGrant({
        secret,
        executionId: "execution2",
        assetId: "asset1",
        now: context.now,
        token,
      }),
    ).toBe(false);
    expect(
      verifyProviderMediaGrant({ ...context, token }),
    ).toBe(false);
  });
});
