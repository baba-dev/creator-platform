import type { Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import {
  assetJobOptions,
  canDispatchAssetJob,
  retryFailedDerivative,
} from "../src/asset-dispatch";

describe("asset retry containment", () => {
  it.each(["failed", "active", "waiting", "delayed", "paused"])(
    "does not reset a %s job on repeated scans",
    async (state) => {
      const remove = vi.fn();
      const queue = {
        getJob: vi
          .fn()
          .mockResolvedValue({ getState: async () => state, remove }),
      } as unknown as Queue;
      for (let scan = 0; scan < 4; scan++)
        expect(await canDispatchAssetJob(queue, "asset")).toBe(false);
      expect(remove).not.toHaveBeenCalled();
      expect(assetJobOptions.removeOnFail).toBe(false);
    },
  );

  it("repairs terminal edit accounting without reopening the execution budget", async () => {
    const remove = vi.fn();
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const queue = {
      getJob: async () => ({ getState: async () => "failed", remove }),
    } as unknown as Queue;
    expect(await canDispatchAssetJob(queue, "edit", cleanup)).toBe(false);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
  });

  it("allows missing jobs and completed jobs whose DB work still needs recovery", async () => {
    const queue = { getJob: async () => undefined } as unknown as Queue;
    expect(await canDispatchAssetJob(queue, "new")).toBe(true);
    const remove = vi.fn().mockResolvedValue(undefined);
    const completed = {
      getJob: async () => ({ getState: async () => "completed", remove }),
    } as unknown as Queue;
    expect(await canDispatchAssetJob(completed, "completed")).toBe(true);
    expect(remove).toHaveBeenCalledOnce();
  });
});

describe("explicit derivative recovery", () => {
  it("audits the exhausted attempt count before resetting the bounded budget", async () => {
    const events: string[] = [];
    const retry = vi.fn(async () => {
      events.push("retry");
    });
    const queue = {
      getJob: async () => ({
        name: "derive",
        data: { assetId: "asset" },
        attemptsMade: 3,
        getState: async () => "failed",
        retry,
      }),
    } as unknown as Queue;
    await retryFailedDerivative(queue, "asset", async (attempts) => {
      expect(attempts).toBe(3);
      events.push("audit");
    });
    expect(events).toEqual(["audit", "retry"]);
    expect(retry).toHaveBeenCalledWith("failed", {
      resetAttemptsMade: true,
      resetAttemptsStarted: true,
    });
  });

  it("does not mutate Redis if auditing fails", async () => {
    const retry = vi.fn();
    const queue = {
      getJob: async () => ({
        name: "derive",
        data: { assetId: "asset" },
        attemptsMade: 3,
        getState: async () => "failed",
        retry,
      }),
    } as unknown as Queue;
    await expect(
      retryFailedDerivative(queue, "asset", async () => {
        throw new Error("database unavailable");
      }),
    ).rejects.toThrow("database unavailable");
    expect(retry).not.toHaveBeenCalled();
  });

  it("cannot reset an active task or unrelated render job", async () => {
    for (const [name, state] of [
      ["derive", "active"],
      ["video-render", "failed"],
    ]) {
      const retry = vi.fn();
      const queue = {
        getJob: async () => ({
          name,
          data: { assetId: "asset" },
          getState: async () => state,
          retry,
        }),
      } as unknown as Queue;
      await expect(
        retryFailedDerivative(queue, "asset", async () => {}),
      ).rejects.toThrow("Only an exhausted");
      expect(retry).not.toHaveBeenCalled();
    }
  });
});
