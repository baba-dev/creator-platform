import {
  type MediaKind,
  type OrchestrationTask,
  type SourceRole,
} from "../contracts/index";

export type CapabilityPricingMetric =
  | "TOKEN"
  | "REQUEST"
  | "CHARACTER"
  | "SECOND"
  | "INPUT_SECOND"
  | "OUTPUT_SECOND";

export interface CapabilityDescriptor {
  readonly id: string;
  readonly task: OrchestrationTask;
  readonly provider: string;
  readonly providerModelId: string;
  readonly displayName: string;
  readonly description: string;
  readonly mediaKind: MediaKind;
  readonly acceptedSourceRoles: readonly SourceRole[];
  readonly outputs: readonly string[];
  readonly features: Readonly<Record<string, unknown>>;
  readonly pricingDimension: CapabilityPricingMetric;
  readonly defaultUnitQuantity: number;
}

/**
 * Built-in specialist tool capability descriptors (non-model native tools).
 */
export const SPECIALIST_TOOL_CAPABILITIES: readonly CapabilityDescriptor[] = [
  {
    id: "tool:matte-portrait-video",
    task: "matte-portrait-video",
    provider: "byteplus-mediakit",
    providerModelId: "matte-portrait-video",
    displayName: "Matte Portrait Video",
    description: "Extract foreground subject matte from portrait video.",
    mediaKind: "VIDEO",
    acceptedSourceRoles: ["SOURCE_VIDEO"],
    outputs: ["assetId"],
    features: { maxDurationSeconds: 120 },
    pricingDimension: "INPUT_SECOND",
    defaultUnitQuantity: 10,
  },
  {
    id: "tool:assess-video-quality",
    task: "assess-video-quality",
    provider: "byteplus-mediakit",
    providerModelId: "assess-video-quality",
    displayName: "Assess Video Quality",
    description: "Comprehensive aesthetic and visual quality scoring.",
    mediaKind: "VIDEO",
    acceptedSourceRoles: ["SOURCE_VIDEO"],
    outputs: ["metadata"],
    features: { maxDurationSeconds: 120 },
    pricingDimension: "INPUT_SECOND",
    defaultUnitQuantity: 10,
  },
  {
    id: "tool:enhance-video-smoothness",
    task: "enhance-video-smoothness",
    provider: "byteplus-mediakit",
    providerModelId: "enhance-video-smoothness",
    displayName: "Enhance Video Smoothness",
    description: "Optical flow frame interpolation for 60fps smoothing.",
    mediaKind: "VIDEO",
    acceptedSourceRoles: ["SOURCE_VIDEO"],
    outputs: ["assetId"],
    features: { maxDurationSeconds: 120 },
    pricingDimension: "INPUT_SECOND",
    defaultUnitQuantity: 10,
  },
  {
    id: "tool:video-render",
    task: "video-render",
    provider: "worker-native",
    providerModelId: "ffmpeg-stitch",
    displayName: "Video Composition & Export",
    description: "Assemble video clips, voiceover audio, and subtitles.",
    mediaKind: "VIDEO",
    acceptedSourceRoles: ["SOURCE_VIDEO", "SOURCE_AUDIO"],
    outputs: ["assetId"],
    features: { boundedThreads: true, maxDurationSeconds: 300 },
    pricingDimension: "REQUEST",
    defaultUnitQuantity: 1,
  },
];

/**
 * Registry resolver interface.
 */
export interface CapabilityFilter {
  task: OrchestrationTask;
  sourceRoles?: SourceRole[];
  aspectRatio?: string;
  preferredModelId?: string;
  excludeModelIds?: string[];
}
