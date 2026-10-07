import type { IconName } from "@/components/ui/icon";

export type WorkspaceToolCategoryKey = "image" | "video" | "audio" | "creative";

export interface WorkspaceToolDefinition {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  segment: string;
  icon: IconName;
  badge?: string;
  keywords?: readonly string[];
  matchDescendants?: boolean;
}

export interface WorkspaceToolCategory {
  key: WorkspaceToolCategoryKey;
  label: string;
  icon: IconName;
  items: readonly WorkspaceToolDefinition[];
}

export interface WorkspaceSecondaryItem {
  id: "projects" | "history" | "assets" | "team" | "connections";
  title: string;
  shortTitle: string;
  description: string;
  segment: string;
  icon: IconName;
  matchDescendants?: boolean;
}

export const WORKSPACE_TOOL_CATEGORIES: readonly WorkspaceToolCategory[] = [
  {
    key: "image",
    label: "Image",
    icon: "image",
    items: [
      {
        id: "image-studio",
        title: "Image Studio",
        shortTitle: "Image",
        description: "Generate photorealistic art, products & visual concepts",
        segment: "image",
        icon: "image",
        keywords: ["seedream", "text to image", "image generation"],
      },
      {
        id: "precision-image",
        title: "Precision Image Studio",
        shortTitle: "Precision Image",
        description:
          "AI retouching, layered PSD composition, crop, resize & transforms",
        segment: "image/precision",
        icon: "wand",
        badge: "Edit",
        keywords: ["image editor", "crop", "resize", "retouch"],
      },
    ],
  },
  {
    key: "video",
    label: "Video",
    icon: "video",
    items: [
      {
        id: "video-studio",
        title: "Video Studio",
        shortTitle: "Video",
        description: "Cinematic text-to-video & image-to-video camera control",
        segment: "video",
        icon: "video",
        keywords: ["seedance", "text to video", "image to video"],
      },
      {
        id: "spokesperson",
        title: "AI Spokesperson",
        shortTitle: "Spokesperson",
        description: "Realistic talking presenters and branded avatars",
        segment: "spokesperson",
        icon: "sparkles",
        badge: "New",
        keywords: ["omnihuman", "avatar", "talking presenter"],
      },
      {
        id: "video-editor",
        title: "Video Editing Desk",
        shortTitle: "Video Editor",
        description: "Trim, reorder, frame, caption, mix, and export videos",
        segment: "video/editor",
        icon: "director",
        keywords: ["trim", "crop", "edit video"],
      },
    ],
  },
  {
    key: "audio",
    label: "Audio",
    icon: "voice",
    items: [
      {
        id: "voice-studio",
        title: "Voice Studio",
        shortTitle: "Voice",
        description: "Neural voice narration and multilingual synthesis",
        segment: "speech",
        icon: "voice",
        keywords: ["tts", "text to speech", "seed speech"],
      },
      {
        id: "audio-generation",
        title: "Audio Generation",
        shortTitle: "Audio Generation",
        description: "Advanced Seed Audio voice generation and voice matching",
        segment: "audio",
        icon: "sparkles",
        badge: "New",
        keywords: [
          "seed audio",
          "advanced voiceover",
          "dola",
          "voice matching",
        ],
      },
      {
        id: "transcription",
        title: "Speech / Transcription",
        shortTitle: "Transcription",
        description: "Transcribe audio or video and export SRT/VTT subtitles",
        segment: "speech/transcription",
        icon: "script",
        keywords: ["speech to text", "subtitles", "srt", "vtt"],
      },
      {
        id: "voice-casting",
        title: "Voice Casting Booth",
        shortTitle: "Voice Casting",
        description: "Audition, compare, and cast verified voices",
        segment: "speech/voices",
        icon: "voice",
        keywords: ["voices", "voice catalog", "casting"],
      },
    ],
  },
  {
    key: "creative",
    label: "Creative",
    icon: "wand",
    items: [
      {
        id: "character-chat",
        title: "Character Chat",
        shortTitle: "Character Chat",
        description:
          "Multi-turn AI persona conversations with optional realtime voice",
        segment: "chat",
        icon: "chat",
        keywords: [
          "persona",
          "realtime voice persona",
          "roleplay",
          "character conversation",
        ],
      },
      {
        id: "creative-director",
        title: "Creative Director",
        shortTitle: "Director",
        description: "Multimodal story direction and storyboard generation",
        segment: "director",
        icon: "director",
        keywords: ["storyboard", "campaign", "creative direction"],
      },
      {
        id: "scriptwriter",
        title: "Scriptwriter",
        shortTitle: "Scriptwriter",
        description: "Screenplays, narrative dialogue, and commercial ads",
        segment: "scripts",
        icon: "script",
        keywords: ["scripts", "screenplay", "dialogue"],
      },
      {
        id: "brand-story",
        title: "Brand & Story",
        shortTitle: "Brand & Story",
        description: "Brand voice, story planning, beat sheets, and characters",
        segment: "brand-assistants",
        icon: "brand",
        keywords: [
          "brand assistants",
          "story planner",
          "story planning",
          "narrative beats",
          "brand strategy",
        ],
      },
      {
        id: "templates",
        title: "Generation Templates",
        shortTitle: "Templates",
        description: "Ready-to-use proven pipelines and community recipes",
        segment: "templates",
        icon: "wand",
        keywords: ["recipes", "workflows"],
        matchDescendants: true,
      },
    ],
  },
];

export const WORKSPACE_TOOLS: readonly WorkspaceToolDefinition[] =
  WORKSPACE_TOOL_CATEGORIES.flatMap((category) => category.items);

export const WORKSPACE_SECONDARY_ITEMS: readonly WorkspaceSecondaryItem[] = [
  {
    id: "projects",
    title: "Projects",
    shortTitle: "Projects",
    description: "Organize creative work and related generations",
    segment: "projects",
    icon: "projects",
    matchDescendants: true,
  },
  {
    id: "history",
    title: "Generation History",
    shortTitle: "History",
    description: "View recent jobs and execution logs",
    segment: "history",
    icon: "activity",
    matchDescendants: true,
  },
  {
    id: "assets",
    title: "Asset Library",
    shortTitle: "Assets",
    description: "Browse uploaded and generated media",
    segment: "assets",
    icon: "assets",
  },
  {
    id: "team",
    title: "Team & Members",
    shortTitle: "Team",
    description: "Manage collaborator roles and spending caps",
    segment: "members",
    icon: "admin",
  },
  {
    id: "connections",
    title: "Connections & Storage",
    shortTitle: "Connections",
    description: "Configure cloud storage and external connections",
    segment: "storage",
    icon: "settings",
  },
];

export function getWorkspaceBase(slug: string): string {
  return `/app/${encodeURIComponent(slug)}`;
}

export function getWorkspaceItemHref(
  base: string,
  item: Pick<WorkspaceToolDefinition | WorkspaceSecondaryItem, "segment">,
): string {
  return `${base}/${item.segment}`;
}

export function isWorkspaceItemActive(
  pathname: string,
  base: string,
  item: Pick<
    WorkspaceToolDefinition | WorkspaceSecondaryItem,
    "segment" | "matchDescendants"
  >,
): boolean {
  const href = getWorkspaceItemHref(base, item);
  return (
    pathname === href ||
    (item.matchDescendants === true && pathname.startsWith(`${href}/`))
  );
}

export function isWorkspaceCategoryActive(
  pathname: string,
  base: string,
  category: WorkspaceToolCategory,
): boolean {
  return category.items.some((item) => {
    const href = getWorkspaceItemHref(base, item);
    return pathname === href || pathname.startsWith(`${href}/`);
  });
}
