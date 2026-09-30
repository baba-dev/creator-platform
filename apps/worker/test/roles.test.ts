import { describe, expect, it } from "vitest";
import { workerQueues } from "../src/roles";
import { parseServerEnv } from "@aiwa/config";

describe("worker role isolation", () => {
  it("partitions queues with exactly one consumer owner", () => {
    const orchestration = workerQueues("orchestration");
    const mail = workerQueues("mail");
    const media = workerQueues("media");
    const split = [...orchestration, ...mail, ...media];
    expect(new Set(split).size).toBe(split.length);
    expect(split.sort()).toEqual(workerQueues("all").sort());
    expect(workerQueues("core").sort()).toEqual(
      [...orchestration, ...mail].sort(),
    );
    expect(media).toEqual(["asset-ingestion"]);
  });
  it("rejects unknown roles before consuming queues", () => {
    expect(() =>
      parseServerEnv({
        AUTH_SECRET: "x".repeat(32),
        DATABASE_URL: "mysql://local",
        WORKER_ROLE: "invalid",
      }),
    ).toThrow(/WORKER_ROLE/);
  });
});
