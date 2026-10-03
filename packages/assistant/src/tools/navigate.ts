import { z } from "zod";
import type { AssistantTool, AssistantToolContext } from "./types";

const inputSchema = z.object({
  destination: z.enum([
    "ASSETS",
    "TEMPLATES",
    "IMAGE_STUDIO",
    "VIDEO_STUDIO",
    "CHAT",
    "PROJECTS",
    "SETTINGS",
  ]),
});

const routes: Record<z.infer<typeof inputSchema>["destination"], string> = {
  ASSETS: "assets",
  TEMPLATES: "templates",
  IMAGE_STUDIO: "studio/image",
  VIDEO_STUDIO: "studio/video",
  CHAT: "chat",
  PROJECTS: "projects",
  SETTINGS: "settings",
};

export const navigateTool: AssistantTool<z.infer<typeof inputSchema>> = {
  description: "Return a safe in-app destination for the user",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>, ctx: AssistantToolContext) {
    return {
      destination: input.destination,
      route: `/app/${encodeURIComponent(ctx.organizationSlug)}/${routes[input.destination]}`,
      navigate: true,
    };
  },
};
