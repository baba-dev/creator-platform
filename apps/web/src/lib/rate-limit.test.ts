import { describe, expect, it } from "vitest";
import { rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("allows up to max requests within window and tracks remaining count", async () => {
    const limiter = rateLimit({
      max: 3,
      windowMs: 60_000,
      prefix: "test-allow",
    });

    const res1 = await limiter.evaluate("user-1");
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(2);
    expect(res1.limit).toBe(3);

    const res2 = await limiter.evaluate("user-1");
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(1);

    const res3 = await limiter.evaluate("user-1");
    expect(res3.allowed).toBe(true);
    expect(res3.remaining).toBe(0);

    const res4 = await limiter.evaluate("user-1");
    expect(res4.allowed).toBe(false);
    expect(res4.remaining).toBe(0);
    expect(res4.resetSeconds).toBeGreaterThan(0);
  });

  it("returns 429 NextResponse with standard RateLimit and Retry-After headers", async () => {
    const limiter = rateLimit({
      max: 1,
      windowMs: 30_000,
      prefix: "test-headers",
    });

    const check1 = await limiter.check("user-headers");
    expect(check1).toBeNull(); // Allowed

    const check2 = await limiter.check("user-headers");
    expect(check2).not.toBeNull();
    expect(check2?.status).toBe(429);

    const headers = check2?.headers;
    expect(headers?.get("RateLimit-Limit")).toBe("1");
    expect(headers?.get("RateLimit-Remaining")).toBe("0");
    expect(headers?.get("RateLimit-Reset")).toBeTruthy();
    expect(headers?.get("Retry-After")).toBeTruthy();
    expect(headers?.get("X-RateLimit-Limit")).toBe("1");
  });

  it("maintains independent buckets for different users", async () => {
    const limiter = rateLimit({
      max: 1,
      windowMs: 60_000,
      prefix: "test-users",
    });

    const checkUserA1 = await limiter.check("user-A");
    expect(checkUserA1).toBeNull();

    const checkUserA2 = await limiter.check("user-A");
    expect(checkUserA2?.status).toBe(429);

    // user-B should still have quota
    const checkUserB1 = await limiter.check("user-B");
    expect(checkUserB1).toBeNull();
  });

  it("maintains independent buckets for different prefixes", async () => {
    const limiter1 = rateLimit({
      max: 1,
      windowMs: 60_000,
      prefix: "prefix-one",
    });
    const limiter2 = rateLimit({
      max: 1,
      windowMs: 60_000,
      prefix: "prefix-two",
    });

    const res1 = await limiter1.check("shared-user");
    expect(res1).toBeNull();

    const res2 = await limiter1.check("shared-user");
    expect(res2?.status).toBe(429);

    // prefix-two should still be open for shared-user
    const res3 = await limiter2.check("shared-user");
    expect(res3).toBeNull();
  });

  it("handles concurrent requests atomically", async () => {
    const limiter = rateLimit({
      max: 5,
      windowMs: 60_000,
      prefix: "test-concurrency",
    });

    const results = await Promise.all(
      Array.from({ length: 10 }).map(() => limiter.evaluate("concurrent-user")),
    );

    const allowed = results.filter((r) => r.allowed);
    const blocked = results.filter((r) => !r.allowed);

    expect(allowed.length).toBe(5);
    expect(blocked.length).toBe(5);
  });
});
