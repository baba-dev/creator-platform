import { db } from "@aiwa/db";
import { z } from "zod";
import { requirePixelAccess } from "./access";
import type { AssistantToolContext } from "./tools/types";

// Explicit opt-in choices only. No inferred private biography or free-form instructions.
export const pixelPreferenceSchema = z
  .object({
    enabled: z.boolean().default(false),
    language: z.enum(["English", "Hinglish", "Arabic"]).default("English"),
    responseStyle: z.enum(["concise", "detailed"]).default("concise"),
    aspectRatio: z.enum(["1:1", "9:16", "16:9"]).default("1:1"),
    brandProfileId: z.string().min(1).max(100).nullable().default(null),
  })
  .strict();

export async function getPixelPreferences(ctx: AssistantToolContext) {
  await requirePixelAccess(ctx);
  const row = await db.pixelPreference.findUnique({
    where: {
      organizationId_userId: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      },
    },
  });
  return pixelPreferenceSchema.parse(row?.preferences ?? {});
}

export async function savePixelPreferences(
  ctx: AssistantToolContext,
  raw: unknown,
) {
  await requirePixelAccess(ctx);
  const preferences = pixelPreferenceSchema.parse(raw);
  if (preferences.brandProfileId) {
    const brand = await db.brandProfile.findFirst({
      where: {
        id: preferences.brandProfileId,
        organizationId: ctx.organizationId,
      },
      select: { id: true },
    });
    if (!brand) throw new Error("Brand profile not found in this workspace.");
  }
  if (!preferences.enabled) {
    await db.pixelPreference.deleteMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId },
    });
    return pixelPreferenceSchema.parse({});
  }
  await db.pixelPreference.upsert({
    where: {
      organizationId_userId: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      },
    },
    create: {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      preferences,
    },
    update: { preferences },
  });
  return preferences;
}
