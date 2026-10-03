export const STUDIO_TASKS = [
  "chat",
  "character-chat",
  "scriptwriting",
  "creative-director",
  "brand-strategy",
  "story-planning",
  "prompt-enhancement",
  "speech-synthesis",
  "transcription",
  "image-generation",
  "video-generation",
] as const;

export type StudioTask = (typeof STUDIO_TASKS)[number];

export const STUDIO_TASK_LABELS: Readonly<Record<StudioTask, string>> = {
  chat: "Chat",
  "character-chat": "Character Chat",
  scriptwriting: "Scripts",
  "creative-director": "Creative Director",
  "brand-strategy": "Brand Strategy",
  "story-planning": "Story Planning",
  "prompt-enhancement": "Prompt Enhance",
  "speech-synthesis": "Speech",
  transcription: "Transcription",
  "image-generation": "Image",
  "video-generation": "Video",
};

export const STUDIO_TASK_DEFAULT_PROVIDER_MODEL_IDS: Readonly<
  Partial<Record<StudioTask, string>>
> = {
  "character-chat": "doubao-seed-character-260628",
  "creative-director": "dola-seed-2-1-turbo-260628",
  scriptwriting: "seed-2-0-lite-260428",
  "brand-strategy": "seed-2-0-pro-260328",
  "story-planning": "dola-seed-2-1-turbo-260628",
  "prompt-enhancement":
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  "speech-synthesis": "seed-tts-2.0",
  "image-generation": "seedream-5-0-260128",
};

type CapabilityValue = boolean | number | string;
type CapabilityRecord = Readonly<Record<string, CapabilityValue>>;

export interface StudioTaskModelDescriptor {
  readonly id: string;
  readonly provider: string;
  readonly mediaKind: string;
  readonly capabilities: CapabilityRecord;
}

const TASK_MEDIA_KINDS: Readonly<Record<StudioTask, readonly string[]>> = {
  chat: ["text"],
  "character-chat": ["text"],
  scriptwriting: ["text"],
  "creative-director": ["text"],
  "brand-strategy": ["text"],
  "story-planning": ["text"],
  "prompt-enhancement": ["reasoning"],
  "speech-synthesis": ["voice"],
  transcription: ["voice"],
  "image-generation": ["image"],
  "video-generation": ["video"],
};

const LEGACY_CAPABILITIES: Readonly<
  Partial<Record<StudioTask, readonly string[]>>
> = {
  chat: ["chat"],
  "character-chat": ["characterChat"],
  scriptwriting: ["scriptwriting"],
  "creative-director": ["creativeDirector"],
  "brand-strategy": ["brandStrategy"],
  "story-planning": ["storyPlanning"],
  "speech-synthesis": ["speechSynthesis"],
  transcription: ["transcription"],
};

const VERIFIED_TASK_OVERRIDES: Readonly<
  Record<string, readonly StudioTask[]>
> = {
  "byteplus:dola-seed-2-1-turbo-260628": [
    "creative-director",
    "story-planning",
  ],
  "byteplus:seed-2-0-pro-260328": [
    "creative-director",
    "brand-strategy",
  ],
  "byteplus:seed-tts-2.0": ["speech-synthesis"],
};

function normalizeProvider(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeMediaKind(value: string): string {
  return value.trim().toLowerCase();
}

export function studioTaskCapability(task: StudioTask): `task:${StudioTask}` {
  return `task:${task}`;
}

export function acceptedMediaKindsForStudioTask(
  task: StudioTask,
): readonly string[] {
  return TASK_MEDIA_KINDS[task];
}

export function studioTaskAcceptsMediaKind(
  task: StudioTask,
  mediaKind: string,
): boolean {
  return TASK_MEDIA_KINDS[task].includes(normalizeMediaKind(mediaKind));
}

function hasLegacyTaskCapability(
  capabilities: CapabilityRecord,
  task: StudioTask,
): boolean {
  return (LEGACY_CAPABILITIES[task] ?? []).some(
    (key) => capabilities[key] === true,
  );
}

function hasVerifiedTaskOverride(
  model: Pick<StudioTaskModelDescriptor, "id" | "provider">,
  task: StudioTask,
): boolean {
  const key = `${normalizeProvider(model.provider)}:${model.id}`;
  return (VERIFIED_TASK_OVERRIDES[key] ?? []).includes(task);
}

export function supportsStudioTask(
  model: StudioTaskModelDescriptor,
  task: StudioTask,
): boolean {
  if (!studioTaskAcceptsMediaKind(task, model.mediaKind)) return false;
  const capability = studioTaskCapability(task);
  return (
    model.capabilities[capability] === true ||
    hasLegacyTaskCapability(model.capabilities, task) ||
    hasVerifiedTaskOverride(model, task) ||
    (task === "image-generation" &&
      normalizeMediaKind(model.mediaKind) === "image") ||
    (task === "video-generation" &&
      normalizeMediaKind(model.mediaKind) === "video")
  );
}

export function listStudioTasksForModel(
  model: StudioTaskModelDescriptor,
): StudioTask[] {
  return STUDIO_TASKS.filter((task) => supportsStudioTask(model, task));
}

export function normalizeStudioTaskCapabilities(
  model: StudioTaskModelDescriptor,
): Record<string, CapabilityValue> {
  const capabilities: Record<string, CapabilityValue> = {
    ...model.capabilities,
  };
  for (const task of listStudioTasksForModel(model)) {
    capabilities[studioTaskCapability(task)] = true;
  }
  return capabilities;
}
