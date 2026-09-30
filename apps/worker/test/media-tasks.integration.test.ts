import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { db } from "@aiwa/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertMediaOwnership,
  claimMediaTask,
  completeMediaTask,
  ensureMediaTask,
  recoverMediaCapacity,
  renewMediaTask,
  retryMediaTask,
  reviewExpiredMediaTasks,
  runMediaTask,
  withDatabaseMediaCapacity,
  abandonMediaTask,
} from "../src/media-tasks";
const prefix = `durable-${randomUUID()}`;
let index = 0;
const orgId = `${prefix}-org`,
  userId = `${prefix}-user`;
const makeTask = (
  kind: "PREVIEW" | "POSTER" | "STORYBOARD" | "VIDEO_RENDER" = "PREVIEW",
) =>
  ensureMediaTask({
    targetId: `${prefix}-${index++}`,
    organizationId: orgId,
    kind,
  });
describe.skipIf(process.env.GENERATION_INTEGRATION_TEST !== "true")(
  "durable media ownership with MariaDB",
  () => {
    beforeAll(async () => {
      await db.user.create({
        data: {
          id: userId,
          email: `${prefix}@example.invalid`,
          name: "Media fixture",
        },
      });
      await db.organization.create({
        data: {
          id: orgId,
          name: "Media fixture",
          slug: prefix,
          ownerUserId: userId,
        },
      });
    });
    afterAll(async () => {
      const tasks = await db.mediaTask.findMany({
        where: { organizationId: orgId },
        select: { id: true },
      });
      await db.mediaTaskAttempt.deleteMany({
        where: { taskId: { in: tasks.map((task) => task.id) } },
      });
      await db.mediaTask.deleteMany({ where: { organizationId: orgId } });
      await db.auditEvent.deleteMany({
        where: {
          OR: [{ organizationId: orgId }, { targetType: "MediaCapacity" }],
        },
      });
      await db.mediaCapacity.deleteMany({ where: { id: "native-media-v1" } });
      await db.asset.deleteMany({ where: { organizationId: orgId } });
      await db.organization.delete({ where: { id: orgId } });
      await db.user.delete({ where: { id: userId } });
      await db.$disconnect();
    });
    it("one claimant wins; renewal preserves ownership", async () => {
      const task = await makeTask();
      const claims = await Promise.all([
        claimMediaTask(task.id),
        claimMediaTask(task.id),
      ]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      const winner = claims.find(Boolean)!;
      await renewMediaTask(winner);
      expect(
        (await db.mediaTask.findUniqueOrThrow({ where: { id: task.id } }))
          .attemptCount,
      ).toBe(1);
      expect(
        await db.mediaTaskAttempt.count({ where: { taskId: task.id } }),
      ).toBe(1);
      await expect(
        renewMediaTask({ ...winner, fence: winner.fence + 1 }),
      ).rejects.toThrow("ownership");
    });
    it("queue loss and repeated scans never reset legacy exhaustion", async () => {
      const targetId = `${prefix}-${index++}`;
      const task = await ensureMediaTask({
        targetId,
        organizationId: orgId,
        kind: "POSTER",
        legacyFailed: true,
        legacyAttempts: 3,
      });
      for (let scan = 0; scan < 3; scan++)
        await ensureMediaTask({
          targetId,
          organizationId: orgId,
          kind: "POSTER",
        });
      expect(await claimMediaTask(task.id)).toBeNull();
      expect(
        (await db.mediaTask.findUniqueOrThrow({ where: { id: task.id } }))
          .attemptCount,
      ).toBe(3);
    });
    it("bounded retries, cooldown and partial completion survive queue loss", async () => {
      const task = await makeTask("STORYBOARD");
      const poster = await ensureMediaTask({
        targetId: task.targetId,
        organizationId: orgId,
        kind: "POSTER",
      });
      expect(await runMediaTask(poster.id, async () => {})).toBe(true);
      for (let attempt = 1; attempt <= 3; attempt++) {
        expect(
          await runMediaTask(task.id, async () => {
            throw new Error("decode failed");
          }),
        ).toBe(false);
        if (attempt < 3) {
          expect(await claimMediaTask(task.id)).toBeNull();
          await db.mediaTask.update({
            where: { id: task.id },
            data: { nextAttemptAt: new Date(0) },
          });
        }
      }
      expect(await claimMediaTask(task.id)).toBeNull();
      const record = await db.mediaTask.findUniqueOrThrow({
        where: { id: task.id },
        include: { attempts: true },
      });
      expect(record.status).toBe("FAILED");
      expect(record.attempts).toHaveLength(3);
      expect(
        (await db.mediaTask.findUniqueOrThrow({ where: { id: poster.id } }))
          .status,
      ).toBe("SUCCEEDED");
    });
    it("expired ownership blocks publication; recovery retains history and audits", async () => {
      const task = await makeTask();
      await db.asset.create({
        data: {
          id: task.targetId,
          organizationId: orgId,
          status: "READY",
          mediaKind: "IMAGE",
          storageProvider: "LOCAL",
          objectKey: `${prefix}/${task.targetId}.png`,
          mimeType: "image/png",
          byteSize: 1n,
        },
      });
      await runMediaTask(task.id, async () => {
        await db.mediaTask.update({
          where: { id: task.id },
          data: { leaseUntil: new Date(0) },
        });
        await expect(
          db.$transaction((tx) => assertMediaOwnership(tx)),
        ).rejects.toThrow("ownership");
      });
      expect(
        (await db.mediaTask.findUniqueOrThrow({ where: { id: task.id } }))
          .status,
      ).toBe("REVIEW");
      await expect(retryMediaTask(task.id)).rejects.toThrow("Confirm");
      await retryMediaTask(task.id, true);
      expect(
        (await db.mediaTask.findUniqueOrThrow({ where: { id: task.id } }))
          .cycle,
      ).toBe(2);
      expect(
        await db.mediaTaskAttempt.count({ where: { taskId: task.id } }),
      ).toBe(1);
      expect(
        await db.auditEvent.count({
          where: { targetId: task.id, action: "media.task_retry_requested" },
        }),
      ).toBe(1);
      expect(
        await runMediaTask(task.id, async () => {
          await db.$transaction((tx) => completeMediaTask(tx));
        }),
      ).toBe(true);
      expect(
        await runMediaTask(task.id, async () => {
          throw new Error("must not run");
        }),
      ).toBe(false);
    });
    it("operator revocation fences stale publication and retains abandoned attempts", async () => {
      const task = await makeTask("VIDEO_RENDER");
      await runMediaTask(task.id, async () => {
        await db.mediaTask.update({
          where: { id: task.id },
          data: { leaseUntil: new Date(0) },
        });
        await reviewExpiredMediaTasks();
        await abandonMediaTask(task.id);
        await expect(
          db.$transaction((tx) => completeMediaTask(tx)),
        ).rejects.toThrow("ownership");
      });
      expect(
        (await db.mediaTask.findUniqueOrThrow({ where: { id: task.id } }))
          .status,
      ).toBe("FAILED");
      expect(
        (
          await db.mediaTaskAttempt.findFirstOrThrow({
            where: { taskId: task.id },
          })
        ).outcome,
      ).toBe("ABANDONED");
    });
    it("native gate serializes callers, releases failure, blocks expiry", async () => {
      let active = 0,
        maximum = 0;
      const outcomes = await Promise.allSettled(
        [true, false].map((fail) =>
          withDatabaseMediaCapacity(async () => {
            active++;
            maximum = Math.max(maximum, active);
            try {
              await new Promise((resolve) => setTimeout(resolve, 30));
              if (fail) throw new Error("native failure");
            } finally {
              active--;
            }
          }),
        ),
      );
      expect(maximum).toBe(1);
      expect(outcomes.map((result) => result.status)).toEqual([
        "rejected",
        "fulfilled",
      ]);
      await db.mediaCapacity.update({
        where: { id: "native-media-v1" },
        data: { owner: "dead-process", leaseUntil: new Date(0) },
      });
      await expect(
        withDatabaseMediaCapacity(async () => {
          throw new Error("must not run");
        }),
      ).rejects.toThrow("ownership");
      await recoverMediaCapacity();
      expect(await withDatabaseMediaCapacity(async () => "recovered")).toBe(
        "recovered",
      );
    }, 10_000);
    it("another Node process respects the native slot", async () => {
      let output = "",
        stderr = "";
      let child: ReturnType<typeof spawn> | undefined;
      let completion: Promise<void> | undefined;
      try {
        await withDatabaseMediaCapacity(async () => {
          child = spawn(
            process.execPath,
            [
              "--import",
              "tsx",
              "--input-type=module",
              "-e",
              `import { withDatabaseMediaCapacity } from './src/media-tasks.ts'; import { db } from '@aiwa/db'; console.log('ready'); try { await withDatabaseMediaCapacity(async () => console.log('entered')); } finally { await db.$disconnect(); }`,
            ],
            {
              cwd: join(import.meta.dirname, ".."),
              env: process.env,
              stdio: ["ignore", "pipe", "pipe"],
            },
          );
          completion = new Promise((resolve, reject) => {
            child!.once("error", reject);
            child!.once("exit", (code) =>
              code === 0
                ? resolve()
                : reject(new Error(`Child failed (${code}): ${stderr}`)),
            );
          });
          void completion.catch(() => undefined);
          child.stdout!.on("data", (chunk: Buffer) => {
            output += chunk.toString();
          });
          child.stderr!.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
          });
          for (
            let attempt = 0;
            attempt < 100 && !output.includes("ready");
            attempt++
          )
            await new Promise((resolve) => setTimeout(resolve, 20));
          expect(output).toContain("ready");
          await new Promise((resolve) => setTimeout(resolve, 100));
          expect(output).not.toContain("entered");
        });
        await completion;
        expect(output).toContain("entered");
      } finally {
        child?.kill("SIGKILL");
      }
    }, 10_000);
  },
);
