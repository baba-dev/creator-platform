export type LandingStudioModeId =
  | "image"
  | "video"
  | "voice"
  | "spokesperson";

export type LandingModel = {
  id: string;
  name: string;
  provider: string;
  badge: string;
  description: string;
  capabilities: readonly string[];
};

export type LandingStudioMode = {
  id: LandingStudioModeId;
  label: string;
  icon: "image" | "video" | "voice" | "sparkles";
  eyebrow: string;
  promptLabel: string;
  prompt: string;
  outputTitle: string;
  outputDetail: string;
  models: readonly LandingModel[];
};

export const landingStudioModes: readonly LandingStudioMode[] = [
  {
    id: "image",
    label: "Image",
    icon: "image",
    eyebrow: "Image Studio",
    promptLabel: "Creative prompt + references",
    prompt:
      "A premium Omani fragrance campaign at golden hour, sculpted light, mineral textures, editorial product photography.",
    outputTitle: "Campaign key visual",
    outputDetail: "Reference-aware generation and precision editing",
    models: [
      {
        id: "seedream-5-pro",
        name: "Seedream 5.0 Pro",
        provider: "BytePlus",
        badge: "Precision",
        description:
          "High-quality image generation with coordinate-guided precision editing.",
        capabilities: [
          "Multi-reference",
          "Inpainting & outpainting",
          "Object replacement",
          "Up to 2K",
        ],
      },
      {
        id: "seedream-5-lite",
        name: "Seedream 5.0 Lite",
        provider: "BytePlus",
        badge: "Flexible",
        description:
          "Prompt-aware image creation with strong consistency and multi-image workflows.",
        capabilities: [
          "Up to 14 references",
          "Sequential images",
          "Up to 4K",
          "Wide aspect support",
        ],
      },
      {
        id: "seedream-4-5",
        name: "Seedream 4.5",
        provider: "BytePlus",
        badge: "Studio",
        description:
          "Reliable campaign visuals, typography, and multi-reference composition.",
        capabilities: [
          "Up to 4K",
          "Multi-reference",
          "Sequential images",
          "21:9 to 9:16",
        ],
      },
    ],
  },
  {
    id: "video",
    label: "Video",
    icon: "video",
    eyebrow: "Video Studio",
    promptLabel: "Shot direction + multimodal references",
    prompt:
      "Open on the product silhouette, dolly through soft desert haze, reveal the bottle as the light shifts from amber to cool blue.",
    outputTitle: "Launch film sequence",
    outputDetail: "Text, frames, references, edits, extensions, and audio",
    models: [
      {
        id: "seedance-2-5",
        name: "Seedance 2.5",
        provider: "BytePlus",
        badge: "Director",
        description:
          "Director-grade multimodal video generation with draft review, editing, and extension.",
        capabilities: [
          "4–30 seconds",
          "Up to 1080p",
          "Draft mode",
          "Image/video/audio refs",
        ],
      },
      {
        id: "seedance-2-0",
        name: "Seedance 2.0",
        provider: "BytePlus",
        badge: "Production",
        description:
          "Production video generation with high-resolution output, references, editing, and extension.",
        capabilities: [
          "Up to 4K",
          "First & last frame",
          "Edit & extend",
          "Synchronized audio",
        ],
      },
      {
        id: "seedance-2-0-fast",
        name: "Seedance 2.0 Fast",
        provider: "BytePlus",
        badge: "Fast",
        description:
          "Fast iteration with multimodal references, synchronized audio, editing, and extension.",
        capabilities: [
          "Fast iteration",
          "Up to 720p",
          "Multimodal refs",
          "Edit & extend",
        ],
      },
    ],
  },
  {
    id: "voice",
    label: "Voice",
    icon: "voice",
    eyebrow: "Voice & Speech Studio",
    promptLabel: "Narration script",
    prompt:
      "Where the sea meets the mountains, a new story begins. Warm, assured, cinematic, with a measured pace.",
    outputTitle: "Campaign narration",
    outputDetail: "Expressive synthesis with calibrated playback controls",
    models: [
      {
        id: "seed-speech-2",
        name: "Seed Speech TTS 2.0",
        provider: "BytePlus",
        badge: "Expressive",
        description:
          "Context-aware neural narration for production voice workflows.",
        capabilities: [
          "Streaming",
          "MP3 / OGG / PCM",
          "24 kHz",
          "Speech-rate control",
        ],
      },
    ],
  },
  {
    id: "spokesperson",
    label: "Spokesperson",
    icon: "sparkles",
    eyebrow: "AI Spokesperson",
    promptLabel: "Portrait + driving audio",
    prompt:
      "Use the approved presenter portrait with the campaign narration and preserve natural expression and head motion.",
    outputTitle: "Presenter cut",
    outputDetail: "Portrait-driven talking-avatar video",
    models: [
      {
        id: "omnihuman-1-5",
        name: "OmniHuman 1.5",
        provider: "BytePlus",
        badge: "Avatar",
        description:
          "Expressive talking-avatar video from one portrait and a driving audio track.",
        capabilities: [
          "Portrait + audio",
          "720p / 1080p",
          "Up to 60 seconds",
          "Adaptive framing",
        ],
      },
    ],
  },
] as const;

export type LandingFeatureGroupId =
  | "create"
  | "think"
  | "organize"
  | "control";

export type LandingFeature = {
  title: string;
  description: string;
  icon:
    | "image"
    | "video"
    | "voice"
    | "sparkles"
    | "director"
    | "script"
    | "brand"
    | "story"
    | "wand"
    | "chat"
    | "projects"
    | "assets"
    | "upload"
    | "credits"
    | "user"
    | "admin"
    | "activity"
    | "edit";
  badge?: string;
};

export type LandingFeatureGroup = {
  id: LandingFeatureGroupId;
  label: string;
  description: string;
  features: readonly LandingFeature[];
};

export const landingFeatureGroups: readonly LandingFeatureGroup[] = [
  {
    id: "create",
    label: "Create",
    description:
      "Generate, transform, edit, and finish media without leaving the workspace.",
    features: [
      {
        title: "Image Studio",
        description:
          "Generate campaign visuals with references, ratios, resolutions, variations, and editing workflows.",
        icon: "image",
      },
      {
        title: "AI Retouch & Canvas",
        description:
          "Inpaint, outpaint, replace objects, expand a canvas, and route generated assets into edits.",
        icon: "wand",
        badge: "AI",
      },
      {
        title: "Pixel Editor",
        description:
          "Crop, rotate, resize, transform, and prepare imagery with client-side editing tools.",
        icon: "edit",
      },
      {
        title: "PSD Multi-Layer Studio",
        description:
          "Build image composites and prepare layered Photoshop-oriented production output from the image workspace.",
        icon: "assets",
      },
      {
        title: "Video Studio",
        description:
          "Create from text, first/last frames, references, existing video, or extension workflows.",
        icon: "video",
      },
      {
        title: "Multi-Clip Editor",
        description:
          "Trim, reorder, mute, and assemble video clips into a final sequence.",
        icon: "director",
      },
      {
        title: "AI Spokesperson",
        description:
          "Turn a portrait and driving audio into an expressive presenter video with OmniHuman.",
        icon: "sparkles",
        badge: "OmniHuman",
      },
      {
        title: "Voice & Speech Studio",
        description:
          "Synthesize expressive narration with production controls and reusable audio assets.",
        icon: "voice",
      },
      {
        title: "Voice Casting Booth",
        description:
          "Audition and calibrate verified voices before committing narration to a production workflow.",
        icon: "voice",
      },
      {
        title: "Realtime Voice Persona",
        description:
          "Use conversational voice experiences for guided creative roleplay and interaction.",
        icon: "chat",
      },
    ],
  },
  {
    id: "think",
    label: "Think",
    description:
      "Use AI reasoning to turn rough intent into a coherent creative direction.",
    features: [
      {
        title: "Pixel AI",
        description:
          "An app-aware creative assistant for navigation, context, repeated instructions, and workspace help.",
        icon: "sparkles",
        badge: "Copilot",
      },
      {
        title: "Prompt Enhance",
        description:
          "Improve prompts with task-aware reasoning while preserving the selected generation workflow.",
        icon: "wand",
      },
      {
        title: "Creative Director",
        description:
          "Develop concepts, shot direction, storyboards, scene timing, and production-ready creative plans.",
        icon: "director",
      },
      {
        title: "Scriptwriter",
        description:
          "Draft commercial scripts, screenplays, dialogue, and narrative variants inside a focused studio.",
        icon: "script",
      },
      {
        title: "Story Planner",
        description:
          "Shape narrative arcs, beats, characters, and structured story development.",
        icon: "story",
      },
      {
        title: "Brand & Story Assistants",
        description:
          "Create reusable creative voices and assistants grounded in brand direction and storytelling needs.",
        icon: "brand",
      },
      {
        title: "Multi-provider reasoning",
        description:
          "Route text and reasoning tasks across BytePlus, NVIDIA, Groq, Gemini, and Cloudflare where enabled.",
        icon: "chat",
      },
    ],
  },
  {
    id: "organize",
    label: "Organize",
    description:
      "Keep generations, source media, projects, templates, and storage connected.",
    features: [
      {
        title: "Projects",
        description:
          "Keep campaign work together and move between generation, editing, and asset management.",
        icon: "projects",
      },
      {
        title: "Asset Library",
        description:
          "Manage generated and uploaded media with durable provenance, favourites, folders, tags, and trash recovery.",
        icon: "assets",
      },
      {
        title: "Generation History",
        description:
          "Review jobs, prompts, status, model provenance, outputs, and past media generations.",
        icon: "activity",
      },
      {
        title: "Generation Templates",
        description:
          "Start from reusable image, video, and voice recipes with validated defaults.",
        icon: "wand",
      },
      {
        title: "Bring your own storage",
        description:
          "Use platform storage or connect Google Drive and OneDrive pools, with visible capacity and an active-pool switch.",
        icon: "upload",
        badge: "BYOS",
      },
      {
        title: "Conversation continuity",
        description:
          "Continue creative work through durable conversations instead of restarting context for every request.",
        icon: "chat",
      },
    ],
  },
  {
    id: "control",
    label: "Control",
    description:
      "Give teams freedom to create while keeping access, spend, and operations accountable.",
    features: [
      {
        title: "Organizations & members",
        description:
          "Work in organization-scoped spaces with owners, members, permissions, and per-user limits.",
        icon: "user",
      },
      {
        title: "Credits & wallet",
        description:
          "Show quotes before generation, reserve credits safely, and retain an immutable wallet history.",
        icon: "credits",
      },
      {
        title: "Payments",
        description:
          "Record cash and cheque payments in OMR and grant credits after confirmation.",
        icon: "credits",
      },
      {
        title: "Model & pricing control",
        description:
          "Enable models, publish pricing, manage margins, and keep provider-aware settlement rules explicit.",
        icon: "admin",
      },
      {
        title: "Generation operations",
        description:
          "Inspect provider jobs, retries, reconciliation states, and operational failures from the admin surface.",
        icon: "activity",
      },
      {
        title: "Audited administration",
        description:
          "Keep sensitive administrative actions permission-aware, organization-scoped, and auditable.",
        icon: "admin",
      },
    ],
  },
] as const;

export const reasoningProviders = [
  "BytePlus",
  "NVIDIA",
  "Groq",
  "Gemini",
  "Cloudflare",
] as const;
