import type { MediaKind, Prisma } from "@aiwa/db";
import {
  templateDefaultInputSchema,
  templateVariableDefinitionSchema,
} from "@aiwa/validation";
import { z } from "zod";

export type TemplateVariable = z.infer<typeof templateVariableDefinitionSchema>;
export type TemplateDefaults = z.infer<typeof templateDefaultInputSchema>;
export type TemplateValue = string | number | boolean;

export function parseTemplateVariables(
  value: Prisma.JsonValue,
): TemplateVariable[] {
  return z.array(templateVariableDefinitionSchema).max(20).parse(value);
}

export function parseTemplateDefaults(
  value: Prisma.JsonValue,
): TemplateDefaults {
  return templateDefaultInputSchema.parse(value);
}

export function resolveTemplatePrompt(
  promptTemplate: string,
  variables: TemplateVariable[],
  values: Record<string, TemplateValue>,
  mediaKind?: "IMAGE" | "VIDEO" | "VOICE",
): { prompt: string; referenceAssetIds: string[] } {
  const known = new Set(variables.map((variable) => variable.key));
  for (const key of Object.keys(values)) {
    if (!known.has(key)) throw new Error(`Unknown template variable: ${key}`);
  }

  const normalized: Record<string, TemplateValue> = {};
  const referenceAssetIds: string[] = [];
  for (const variable of variables) {
    const raw = values[variable.key] ?? variable.defaultValue;
    const empty = raw === undefined || raw === null || raw === "";
    if (variable.required && empty)
      throw new Error(`${variable.label} is required.`);
    if (empty) {
      normalized[variable.key] = "";
      continue;
    }
    if (variable.type === "toggle") {
      if (typeof raw !== "boolean")
        throw new Error(`${variable.label} must be on or off.`);
      normalized[variable.key] = raw;
      continue;
    }
    if (variable.type === "number") {
      const number = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(number))
        throw new Error(`${variable.label} must be a number.`);
      normalized[variable.key] = number;
      continue;
    }
    if (typeof raw !== "string")
      throw new Error(`${variable.label} is invalid.`);
    const text = raw.trim();
    if (text.length > 2000) throw new Error(`${variable.label} is too long.`);
    if (
      variable.type === "select" &&
      variable.options &&
      !variable.options.includes(text)
    ) {
      throw new Error(`${variable.label} has an invalid option.`);
    }
    if (variable.type === "reference-image") {
      if (text) referenceAssetIds.push(text);
      normalized[variable.key] = "";
      continue;
    }
    normalized[variable.key] = text;
  }

  const prompt = promptTemplate
    .replace(/{{\s*([a-z][a-zA-Z0-9_]*)\s*}}/g, (_match, key: string) => {
      if (!known.has(key))
        throw new Error(`Template contains an unknown variable: ${key}`);
      const value = normalized[key];
      return value === undefined ? "" : String(value);
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (/{{\s*[a-z][a-zA-Z0-9_]*\s*}}/.test(prompt))
    throw new Error("Template contains unresolved variables.");

  const maxPromptLength = mediaKind === "VOICE" ? 4096 : 2000;
  if (!prompt) throw new Error("Resolved template prompt is empty.");
  if (prompt.length > maxPromptLength)
    throw new Error(
      `Resolved template prompt is too long; maximum is ${maxPromptLength} characters.`,
    );
  return { prompt, referenceAssetIds };
}

function capability(capabilities: Prisma.JsonValue, key: string): boolean {
  return Boolean(
    capabilities &&
    typeof capabilities === "object" &&
    !Array.isArray(capabilities) &&
    (capabilities as Record<string, unknown>)[key] === true,
  );
}

export function modelSupportsTemplate(
  model: { mediaKind: MediaKind; capabilities: Prisma.JsonValue },
  mediaKind: "IMAGE" | "VIDEO" | "VOICE",
  defaults: TemplateDefaults,
  referenceCount = 0,
): boolean {
  if (model.mediaKind !== mediaKind) return false;
  if (mediaKind === "VOICE") return true;

  const capabilityRecord =
    model.capabilities &&
    typeof model.capabilities === "object" &&
    !Array.isArray(model.capabilities)
      ? (model.capabilities as Record<string, unknown>)
      : {};

  if (
    defaults.aspectRatio &&
    !capability(model.capabilities, `aspectRatio:${defaults.aspectRatio}`)
  )
    return false;
  if (
    defaults.resolution &&
    !capability(model.capabilities, `resolution:${defaults.resolution}`)
  )
    return false;
  if (
    mediaKind === "VIDEO" &&
    defaults.durationSeconds &&
    !capability(
      model.capabilities,
      `durationSeconds:${defaults.durationSeconds}`,
    )
  )
    return false;
  if (
    mediaKind === "VIDEO" &&
    defaults.generateAudio &&
    !capability(model.capabilities, "generateAudio")
  )
    return false;

  const maxReferencesRaw = capabilityRecord.maxReferenceImages;
  const maxReferences =
    typeof maxReferencesRaw === "number" ? maxReferencesRaw : 0;

  if (referenceCount > 0) {
    if (!capability(model.capabilities, "referenceImages")) return false;
    if (referenceCount > maxReferences) return false;
  }

  if (mediaKind === "IMAGE") {
    const outputCount = defaults.outputCount ?? 1;
    const maxGeneratedImages =
      typeof capabilityRecord.maxGeneratedImages === "number"
        ? capabilityRecord.maxGeneratedImages
        : 1;
    const maxTotalImages =
      typeof capabilityRecord.maxTotalInputOutputImages === "number"
        ? capabilityRecord.maxTotalInputOutputImages
        : maxGeneratedImages;

    if (outputCount > 1 && capabilityRecord.sequentialImages !== true) {
      return false;
    }
    if (outputCount > maxGeneratedImages) {
      return false;
    }
    if (referenceCount + outputCount > maxTotalImages) {
      return false;
    }
  }

  return true;
}
