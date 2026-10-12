import { WORKSPACE_TOOLS } from "@/lib/workspace-tools";
import type { IconName } from "@/components/ui/icon";

export type PublicToolCategory =
  "image" | "video" | "audio" | "creative" | "finishing";

export const toolCategories: readonly {
  id: PublicToolCategory;
  label: string;
  description: string;
  icon: IconName;
}[] = [
  {
    id: "image",
    label: "Image & Design",
    description: "Create an original image, then make every detail count.",
    icon: "image",
  },
  {
    id: "video",
    label: "Video & Motion",
    description: "Put ideas, portraits and still images into motion.",
    icon: "video",
  },
  {
    id: "audio",
    label: "Audio & Speech",
    description: "Make your words sound like they mean something.",
    icon: "voice",
  },
  {
    id: "creative",
    label: "Creative Intelligence",
    description: "Shape the idea before you spend time creating it.",
    icon: "director",
  },
  {
    id: "finishing",
    label: "MediaKit & Finishing",
    description: "Prepare, transform and refine media for delivery.",
    icon: "wand",
  },
];

type ToolEditorial = {
  slug: string;
  category: PublicToolCategory;
  headline: string;
  summary: string;
  idealFor: string;
  useCases: readonly string[];
  capabilities: readonly string[];
  workflow: readonly string[];
  keywords: readonly string[];
  relatedIds: readonly string[];
  featured?: boolean;
};

const editorial: Record<string, ToolEditorial> = {
  "image-studio": {
    slug: "ai-image-generator",
    category: "image",
    featured: true,
    headline: "Make the image you can imagine.",
    summary:
      "Turn an idea into campaign concepts, product visuals, original illustrations and expressive art. Add references when the chosen model supports them.",
    idealFor:
      "Product launches, advertising visuals, moodboards and social posts.",
    useCases: [
      "Draft a product campaign before a photoshoot",
      "Create an original scene from a short brief",
      "Explore variations for a social-media concept",
    ],
    capabilities: [
      "Text-led creation",
      "Reference-aware workflows",
      "Model-specific aspect ratios and output settings",
      "Follow-up editing through supported workflows",
    ],
    workflow: [
      "Describe the visual and its intended audience.",
      "Pick an enabled model and choose its supported controls.",
      "Review the signed Studio quote, then create and refine.",
    ],
    keywords: [
      "text to image",
      "image generation",
      "seedream",
      "product photo",
      "picture",
      "campaign",
    ],
    relatedIds: ["precision-image", "video-studio", "templates"],
  },
  "precision-image": {
    slug: "ai-image-editor",
    category: "image",
    headline: "Keep the original. Improve the details.",
    summary:
      "Work from an existing image to crop, resize, transform and use model-supported AI retouching in a more controlled editing workflow.",
    idealFor:
      "Product image revisions, layout changes and finishing campaign imagery.",
    useCases: [
      "Adapt a product visual for a different format",
      "Refine an area without restarting the entire concept",
      "Prepare a finished image for production",
    ],
    capabilities: [
      "Crop and resize",
      "Rotate and transform",
      "AI-assisted retouching where supported",
      "Layer-oriented production workflow",
    ],
    workflow: [
      "Choose or upload the image you own or may use.",
      "Select the adjustment or supported AI operation.",
      "Review any quote, finish and save the result.",
    ],
    keywords: [
      "inpainting",
      "outpainting",
      "crop",
      "photo editor",
      "retouch",
      "resize",
    ],
    relatedIds: ["image-studio", "mediakit"],
  },
  "video-studio": {
    slug: "ai-video-generator",
    category: "video",
    featured: true,
    headline: "Give your ideas a moving story.",
    summary:
      "Describe a scene or start with reference imagery to create clips, explore motion and build a more compelling campaign.",
    idealFor:
      "Short-form campaigns, product reveals, concept films and animated photographs.",
    useCases: [
      "Animate a still product visual",
      "Explore a cinematic shot without a set",
      "Prototype a video concept from a storyboard",
    ],
    capabilities: [
      "Text-to-video",
      "Image- and frame-led generation",
      "Model-aware duration and format settings",
      "Editing and extension where supported",
    ],
    workflow: [
      "Start with a scene description or a supported media input.",
      "Choose the model and the controls available for that task.",
      "Review the credit quote before generating.",
    ],
    keywords: [
      "text to video",
      "image to video",
      "animate photo",
      "seedance",
      "cinematic",
    ],
    relatedIds: ["video-editor", "creative-director", "image-studio"],
  },
  spokesperson: {
    slug: "ai-spokesperson",
    category: "video",
    featured: true,
    headline: "Give your message a face.",
    summary:
      "Create a portrait-led presenter video using approved source imagery and driving audio, with the controls supported by the active avatar workflow.",
    idealFor:
      "Explainers, product introductions and presenter-led promotional content.",
    useCases: [
      "Present a short product announcement",
      "Turn approved presenter material into an explainer",
      "Make an on-brand spokesperson concept",
    ],
    capabilities: [
      "Portrait-driven workflow",
      "Driving-audio input",
      "Model-aware output controls",
      "Save the result in your workspace",
    ],
    workflow: [
      "Supply a portrait with appropriate rights and consent.",
      "Add the required driving audio and choose supported settings.",
      "Review the quote and generate the presenter video.",
    ],
    keywords: [
      "avatar",
      "omnihuman",
      "talking portrait",
      "presenter",
      "lip sync",
    ],
    relatedIds: ["voice-studio", "video-studio", "mediakit"],
  },
  "video-editor": {
    slug: "video-editor",
    category: "video",
    headline: "Make every second work harder.",
    summary:
      "Bring clips into one editing desk to trim, reorder and prepare a coherent finished video instead of treating each generation as an isolated output.",
    idealFor:
      "Social ads, short sequences and assembly of multiple generated clips.",
    useCases: [
      "Remove unwanted opening seconds",
      "Combine related clips into a single sequence",
      "Refine the order and pacing of a short campaign",
    ],
    capabilities: [
      "Timeline-based clip ordering",
      "Trimming and preview",
      "Supported media adjustments",
      "Export workflow",
    ],
    workflow: [
      "Choose video assets from your workspace.",
      "Arrange and refine the sequence.",
      "Preview and export the finished result.",
    ],
    keywords: [
      "trim",
      "edit clip",
      "video editing",
      "combine clips",
      "assemble",
    ],
    relatedIds: ["video-studio", "mediakit"],
  },
  "voice-studio": {
    slug: "ai-voice-generator",
    category: "audio",
    featured: true,
    headline: "Find the voice behind the story.",
    summary:
      "Transform written copy into narration using available voices and the supported speech controls, then carry the audio into your creative project.",
    idealFor:
      "Advertisement narration, explainers, social videos and spoken content.",
    useCases: [
      "Narrate a product advertisement",
      "Produce voice for a video explainer",
      "Compare a voiceover direction before final production",
    ],
    capabilities: [
      "Text-to-speech",
      "Voice selection",
      "Supported pacing and speech controls",
      "Reusable audio output",
    ],
    workflow: [
      "Write or paste the narration.",
      "Choose an available voice and its supported settings.",
      "Review the quote and generate the audio.",
    ],
    keywords: ["tts", "text to speech", "narration", "speech", "voiceover"],
    relatedIds: ["voice-casting", "audio-generation", "video-studio"],
  },
  "audio-generation": {
    slug: "advanced-audio-generation",
    category: "audio",
    headline: "Shape audio around the feeling.",
    summary:
      "Use the dedicated advanced audio workspace for model-supported prompt-directed sound and voice generation, including reference-led workflows where available.",
    idealFor:
      "Expressive audio ideas and creative voice-production experiments.",
    useCases: [
      "Explore an expressive voice direction",
      "Work from a permitted reference when supported",
      "Create audio to accompany a wider campaign",
    ],
    capabilities: [
      "Dedicated audio generation workspace",
      "Prompt and supported references",
      "Model-specific controls",
      "Asset-backed results",
    ],
    workflow: [
      "Choose the advanced audio workflow.",
      "Supply text, direction or supported reference material.",
      "Review the current quote before submission.",
    ],
    keywords: [
      "seed audio",
      "dola",
      "advanced audio",
      "voice matching",
      "sound",
    ],
    relatedIds: ["voice-studio", "voice-casting"],
  },
  transcription: {
    slug: "ai-transcription",
    category: "audio",
    headline: "Turn spoken content into something usable.",
    summary:
      "Convert source recordings into readable text and available subtitle formats for editing, review and accessible distribution.",
    idealFor: "Video captions, interviews and speech-to-text workflows.",
    useCases: [
      "Prepare captions for a short video",
      "Get a readable transcript from a recording",
      "Export supported subtitle formats",
    ],
    capabilities: [
      "Audio and supported video input",
      "Speech transcription",
      "SRT and VTT export",
      "Saved result workflow",
    ],
    workflow: [
      "Choose an eligible audio or video file.",
      "Select the available transcription options.",
      "Review the quote and export the result.",
    ],
    keywords: [
      "speech to text",
      "subtitles",
      "captions",
      "srt",
      "vtt",
      "transcript",
    ],
    relatedIds: ["video-editor", "voice-studio"],
  },
  "voice-casting": {
    slug: "voice-casting",
    category: "audio",
    headline: "Cast a voice before recording the story.",
    summary:
      "Audition, compare and choose from verified voice options so a narration begins with the right creative direction.",
    idealFor:
      "Brand narration, character direction and repeatable voice selection.",
    useCases: [
      "Compare narration approaches for an ad",
      "Choose a fitting brand voice",
      "Prepare a voice choice before synthesis",
    ],
    capabilities: [
      "Voice catalogue",
      "Audition and comparison",
      "Verified voice options",
      "Connection to speech workflows",
    ],
    workflow: [
      "Explore the available voice catalogue.",
      "Audition and compare relevant options.",
      "Continue into an appropriate speech workflow.",
    ],
    keywords: ["cast voice", "voice catalogue", "voice audition", "speaker"],
    relatedIds: ["voice-studio", "audio-generation"],
  },
  "character-chat": {
    slug: "character-chat",
    category: "creative",
    headline: "Converse with a character, not a blank prompt.",
    summary:
      "Explore ideas and dialogue through persona-led conversations with model-dependent capabilities and optional voice experiences.",
    idealFor: "Character development, dialogue practice and creative roleplay.",
    useCases: [
      "Explore a fictional character's point of view",
      "Workshop dialogue in context",
      "Get a new perspective on a story concept",
    ],
    capabilities: [
      "Multi-turn persona conversations",
      "Built-in and custom personas",
      "Supported voice interactions",
      "Conversation continuity",
    ],
    workflow: [
      "Choose a persona and an enabled conversation model.",
      "Start your conversation with a scenario.",
      "Refine it through follow-up turns.",
    ],
    keywords: ["ai character", "persona", "chat", "roleplay", "dialogue"],
    relatedIds: ["brand-story", "scriptwriter"],
  },
  "creative-director": {
    slug: "ai-creative-director",
    category: "creative",
    featured: true,
    headline: "Start with direction, not guesswork.",
    summary:
      "Turn a rough campaign brief into clearer creative ideas, scene direction and structured production planning before creating media.",
    idealFor:
      "Agencies, promotional campaigns, concept development and storyboards.",
    useCases: [
      "Find an advertising concept from a client brief",
      "Plan shots for a promotional video",
      "Connect a storyboard to a production workflow",
    ],
    capabilities: [
      "Creative brief development",
      "Concept and shot direction",
      "Storyboard-oriented planning",
      "Follow-up refinement",
    ],
    workflow: [
      "Describe your objective and audience.",
      "Develop the creative direction with the chosen enabled model.",
      "Carry the resulting brief into an appropriate studio.",
    ],
    keywords: [
      "art director",
      "campaign",
      "storyboard",
      "creative brief",
      "concept",
    ],
    relatedIds: ["scriptwriter", "video-studio", "brand-story"],
  },
  scriptwriter: {
    slug: "ai-scriptwriter",
    category: "creative",
    headline: "Get your message into the right words.",
    summary:
      "Develop commercial scripts, dialogue and story outlines in a focused writing workspace designed for iteration.",
    idealFor: "Short video ads, brand storytelling and production scripts.",
    useCases: [
      "Outline a 30-second product advertisement",
      "Draft narration before generating a voice",
      "Explore alternative dialogue or story beats",
    ],
    capabilities: [
      "Script drafting",
      "Dialogue and narrative variants",
      "Iterative revisions",
      "Creative context",
    ],
    workflow: [
      "Describe the audience, format and message.",
      "Generate a first structured draft.",
      "Edit and refine it before moving to production.",
    ],
    keywords: [
      "script",
      "screenplay",
      "advertisement copy",
      "dialogue",
      "commercial",
    ],
    relatedIds: ["creative-director", "voice-studio", "brand-story"],
  },
  "brand-story": {
    slug: "brand-and-story",
    category: "creative",
    headline: "Keep every creative decision on-brand.",
    summary:
      "Develop your brand's creative voice and plan story structure so the next campaign grows from a clear, consistent direction.",
    idealFor: "Brand teams, story development and campaign continuity.",
    useCases: [
      "Define a direction for campaign messaging",
      "Structure a longer story into beats",
      "Build repeatable creative guidance",
    ],
    capabilities: [
      "Brand-focused assistants",
      "Story planning",
      "Character and narrative development",
      "Context-driven refinement",
    ],
    workflow: [
      "Choose the brand or story task.",
      "Add your constraints and creative direction.",
      "Refine the result and continue into connected tools.",
    ],
    keywords: [
      "brand assistant",
      "brand voice",
      "story planner",
      "narrative",
      "brand strategy",
    ],
    relatedIds: ["creative-director", "scriptwriter", "character-chat"],
  },
  mediakit: {
    slug: "mediakit",
    category: "finishing",
    headline: "Give existing media its finishing touches.",
    summary:
      "Discover the available processing tools for image and video preparation, from compression and cropping to other published media operations.",
    idealFor:
      "Final asset preparation, image transformations and supported video processing.",
    useCases: [
      "Prepare images for easier delivery",
      "Apply an approved watermark",
      "Improve or assess compatible video media",
    ],
    capabilities: [
      "Categorized image operations",
      "Video-finishing operations",
      "Source media validation",
      "Pre-execution credit quote",
    ],
    workflow: [
      "Choose a currently enabled operation.",
      "Select the required source asset and controls.",
      "Review its quote before processing.",
    ],
    keywords: [
      "compress",
      "crop",
      "watermark",
      "background",
      "media processing",
      "lip sync",
    ],
    relatedIds: ["precision-image", "video-editor", "spokesperson"],
  },
  templates: {
    slug: "generation-templates",
    category: "creative",
    headline: "Start with a creative recipe.",
    summary:
      "Browse illustrated, reusable starting points that carry a brief and validated defaults into the relevant Studio without making you operate another composer.",
    idealFor:
      "Fast starts, repeatable campaign formats and familiar creative briefs.",
    useCases: [
      "Start a product visual from a prepared brief",
      "Create a familiar social-media format",
      "Explore a new workflow with less setup",
    ],
    capabilities: [
      "Illustrated template gallery",
      "Task-focused starting points",
      "Direct Studio activation",
      "Editable creation settings",
    ],
    workflow: [
      "Browse a template that matches the outcome.",
      "Open its linked workspace Studio.",
      "Customize and review any generation quote.",
    ],
    keywords: ["recipe", "preset", "instagram", "youtube", "template"],
    relatedIds: ["image-studio", "video-studio", "voice-studio"],
  },
};

export type PublicTool = ToolEditorial & {
  id: string;
  title: string;
  icon: IconName;
  segment: string;
  cover: string;
};
const cover = (id: string) => "/tool-art/" + id + ".svg";
export const publicTools: readonly PublicTool[] = WORKSPACE_TOOLS.map(
  (tool) => {
    const item = editorial[tool.id];
    if (!item) throw new Error("Missing public editorial for " + tool.id);
    return {
      ...item,
      id: tool.id,
      title: tool.title,
      icon: tool.icon,
      segment: tool.segment,
      cover: cover(tool.id),
    };
  },
);

export function publicToolBySlug(slug: string): PublicTool | undefined {
  return publicTools.find((tool) => tool.slug === slug);
}
export function publicToolById(id: string): PublicTool | undefined {
  return publicTools.find((tool) => tool.id === id);
}
export function toolHref(tool: Pick<PublicTool, "slug">): string {
  return "/tools/" + tool.slug;
}
export function toolSearch(tool: PublicTool): string {
  return [
    tool.title,
    tool.headline,
    tool.summary,
    tool.idealFor,
    ...tool.useCases,
    ...tool.capabilities,
    ...tool.keywords,
  ]
    .join(" ")
    .toLocaleLowerCase();
}
export function findPublicTools(query: string, category = "all"): PublicTool[] {
  const q = query.trim().toLocaleLowerCase().slice(0, 100);
  return publicTools.filter(
    (tool) =>
      (category === "all" || tool.category === category) &&
      (!q || toolSearch(tool).includes(q)),
  );
}
export type ToolIntent =
  | "image"
  | "edit-image"
  | "video"
  | "presenter"
  | "voice"
  | "transcribe"
  | "plan"
  | "finish";
export type ToolSource = "idea" | "image" | "video" | "audio";
const choices: Record<ToolIntent, Partial<Record<ToolSource, string[]>>> = {
  image: {
    idea: ["image-studio", "templates"],
    image: ["image-studio", "precision-image"],
  },
  "edit-image": {
    image: ["precision-image", "mediakit"],
    idea: ["image-studio"],
  },
  video: {
    idea: ["video-studio", "creative-director"],
    image: ["video-studio", "image-studio"],
    video: ["video-editor", "mediakit"],
  },
  presenter: {
    image: ["spokesperson", "voice-studio"],
    audio: ["spokesperson", "voice-studio"],
    idea: ["scriptwriter", "spokesperson"],
  },
  voice: {
    idea: ["voice-studio", "voice-casting"],
    audio: ["audio-generation", "voice-casting"],
  },
  transcribe: { audio: ["transcription"], video: ["transcription"] },
  plan: {
    idea: ["creative-director", "scriptwriter"],
    image: ["creative-director", "image-studio"],
    video: ["creative-director", "video-editor"],
    audio: ["scriptwriter", "voice-studio"],
  },
  finish: {
    image: ["mediakit", "precision-image"],
    video: ["mediakit", "video-editor"],
  },
};
export function recommendTools(
  intent: ToolIntent,
  source: ToolSource,
): PublicTool[] {
  return (choices[intent]?.[source] ?? []).flatMap((id) => {
    const tool = publicToolById(id);
    return tool ? [tool] : [];
  });
}
