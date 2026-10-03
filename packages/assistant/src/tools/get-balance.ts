import { db } from "@aiwa/db";
import { z } from "zod";
import type { AssistantTool, AssistantToolContext } from "./types";

const inputSchema = z.object({});

export const getBalanceTool: AssistantTool<z.infer<typeof inputSchema>> = {
  description: "Get the organization credit balance",
  inputSchema,
  async execute(
    _input: z.infer<typeof inputSchema>,
    ctx: AssistantToolContext,
  ) {
    const wallet = await db.wallet.findUnique({
      where: { organizationId: ctx.organizationId },
      select: { balanceCache: true },
    });
    const balance = wallet?.balanceCache ?? 0n;
    return {
      balanceCredits: balance.toString(),
      balanceDisplay: `${balance.toLocaleString()} credits`,
    };
  },
};
