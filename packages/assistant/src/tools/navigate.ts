import { z } from "zod";
import type { AssistantTool, AssistantToolContext } from "./types";

const inputSchema = z.object({
  destination: z.enum([
    "ASSETS",
    "TEMPLATES",
    "IMAGE_STUDIO",
    "PRECISION_IMAGE",
    "VIDEO_STUDIO",
    "VIDEO_EDITOR",
    "CHAT",
    "PROJECTS",
    "SETTINGS",
    "SPEECH",
    "TRANSCRIPTION",
    "VOICE_CASTING",
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
  PRECISION_IMAGE: "image/precision",
  VIDEO_STUDIO: "video",
  VIDEO_EDITOR: "video/editor",
  CHAT: "chat",
  PROJECTS: "projects",
  SETTINGS: "",
  SPEECH: "speech",
  TRANSCRIPTION: "speech/transcription",
  VOICE_CASTING: "speech/voices",
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
