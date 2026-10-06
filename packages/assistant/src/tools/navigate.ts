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
    "SPEECH",
    "HISTORY",
    "STORAGE",
    "MEMBERS",
    "DIRECTOR",
    "SCRIPTS",
    "BRANDS",
    "STORIES",
    "SPOKESPERSON",
    "HOME",
  ]),
});

const routes: Record<z.infer<typeof inputSchema>["destination"], string> = {
  ASSETS: "assets",
  TEMPLATES: "templates",
  IMAGE_STUDIO: "image",
  VIDEO_STUDIO: "video",
  CHAT: "chat",
  PROJECTS: "projects",
  SETTINGS: "",
  SPEECH: "speech",
  HISTORY: "history",
  STORAGE: "storage",
  MEMBERS: "members",
  DIRECTOR: "director",
  SCRIPTS: "scripts",
  BRANDS: "brand-assistants",
  STORIES: "story-planning",
  SPOKESPERSON: "spokesperson",
  HOME: "",
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
