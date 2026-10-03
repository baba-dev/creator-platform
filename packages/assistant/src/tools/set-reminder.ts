import { db } from "@aiwa/db";
import { z } from "zod";
import type { AssistantTool, AssistantToolContext } from "./types";

const inputSchema = z.object({
  message: z.string().trim().min(1).max(500),
  remindAt: z.string().datetime(),
});

export const setReminderTool: AssistantTool<z.infer<typeof inputSchema>> = {
  description: "Set an in-app reminder for the user",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>, ctx: AssistantToolContext) {
    const remindAt = new Date(input.remindAt);
    if (remindAt.getTime() <= Date.now()) {
      throw new Error("Reminder time must be in the future.");
    }

    const existing = await db.assistantReminder.findUnique({
      where: { idempotencyKey: ctx.idempotencyKey },
      select: { id: true, message: true, remindAt: true },
    });
    if (existing) {
      return {
        reminderId: existing.id,
        message: existing.message,
        remindAt: existing.remindAt.toISOString(),
        confirmed: true,
        replayed: true,
      };
    }

    const activeCount = await db.assistantReminder.count({
      where: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        cancelledAt: null,
        notifiedAt: null,
        remindAt: { gt: new Date() },
      },
    });
    if (activeCount >= 100) {
      throw new Error("You already have too many active reminders.");
    }

    const reminder = await db.assistantReminder.upsert({
      where: { idempotencyKey: ctx.idempotencyKey },
      update: {},
      create: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        threadId: ctx.threadId,
        idempotencyKey: ctx.idempotencyKey,
        message: input.message,
        remindAt,
      },
      select: { id: true, message: true, remindAt: true },
    });

    return {
      reminderId: reminder.id,
      message: reminder.message,
      remindAt: reminder.remindAt.toISOString(),
      confirmed: true,
    };
  },
};
