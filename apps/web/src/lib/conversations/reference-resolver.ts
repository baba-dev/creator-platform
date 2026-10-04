import { db } from "@aiwa/db";
import type { ConversationPlannerContext } from "./context-builder";
import type { ClarificationOption, ClarificationRequest } from "./types";

export interface ReferenceResolutionResult {
  resolved: boolean;
  assetId?: string;
  sourceRole?: string;
  clarification?: ClarificationRequest;
  confidence: "HIGH" | "MEDIUM" | "AMBIGUOUS";
}

/**
 * Extracts numeric index from phrases like:
 * - "the second image", "second one", "2nd picture", "image 2"
 * - "the first image", "1st one", "first"
 * - "the third", "3rd image", "image three"
 * - "the fourth image", "fourth", "4th"
 */
export function parseOutputIndex(phrase: string): number | null {
  const normalized = phrase.toLowerCase().trim();

  // Explicit number patterns
  const matchNum =
    /(?:image|picture|output|version|result|frame)\s*#?\s*([1-9]\d?)\b/i.exec(
      normalized,
    );
  if (matchNum?.[1]) {
    return Number.parseInt(matchNum[1], 10);
  }

  const matchLeadingNum =
    /\b([1-9]\d?)(?:st|nd|rd|th)?\s+(?:image|picture|output|one|version|result|frame)\b/i.exec(
      normalized,
    );
  if (matchLeadingNum?.[1]) {
    return Number.parseInt(matchLeadingNum[1], 10);
  }

  // Word ordinal patterns
  const ordinals: Record<string, number> = {
    first: 1,
    "1st": 1,
    one: 1,
    second: 2,
    "2nd": 2,
    two: 2,
    third: 3,
    "3rd": 3,
    three: 3,
    fourth: 4,
    "4th": 4,
    four: 4,
    fifth: 5,
    "5th": 5,
    five: 5,
    sixth: 6,
    "6th": 6,
    six: 6,
    seventh: 7,
    "7th": 7,
    seven: 7,
    eighth: 8,
    "8th": 8,
    eight: 8,
    ninth: 9,
    "9th": 9,
    nine: 9,
    tenth: 10,
    "10th": 10,
    ten: 10,
  };

  for (const [word, index] of Object.entries(ordinals)) {
    const regex = new RegExp(
      `\\b(?:the\\s+)?${word}(?:\\s+(?:one|image|picture|output|result|version|frame))?\\b`,
      "i",
    );
    if (regex.test(normalized)) {
      return index;
    }
  }

  return null;
}

export function isRelativeLatestReference(phrase: string): boolean {
  const normalized = phrase.toLowerCase();
  return (
    normalized.includes("the last") ||
    normalized.includes("the previous") ||
    normalized.includes("the latest") ||
    normalized.includes("that one") ||
    normalized.includes("this one") ||
    normalized.includes("this") ||
    normalized.includes("that") ||
    normalized.includes("it")
  );
}

/**
 * Resolves natural language references to actual, verified asset IDs in the organization.
 */
export async function resolveAssetReference(params: {
  text: string;
  organizationId: string;
  context: ConversationPlannerContext;
  explicitAssetId?: string | null;
}): Promise<ReferenceResolutionResult> {
  const { text, organizationId, context, explicitAssetId } = params;

  // Priority 1: Explicit concrete object supplied by trusted UI selection / parameter
  if (explicitAssetId) {
    const verified = await db.asset.findFirst({
      where: {
        id: explicitAssetId,
        organizationId,
        status: "READY",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (verified) {
      return { resolved: true, assetId: verified.id, confidence: "HIGH" };
    }
  }

  // Priority 2: Explicitly numbered output inside active group
  const parsedIndex = parseOutputIndex(text);
  if (parsedIndex !== null) {
    const matchedItem = context.activeOutputGroup.find(
      (item) => item.index === parsedIndex,
    );
    if (matchedItem) {
      // Re-verify tenant authorization
      const verified = await db.asset.findFirst({
        where: {
          id: matchedItem.assetId,
          organizationId,
          status: "READY",
          deletedAt: null,
        },
        select: { id: true },
      });
      if (verified) {
        return { resolved: true, assetId: verified.id, confidence: "HIGH" };
      }
    } else {
      // Number was requested out of range (e.g. index 3 when only 2 exist)
      const options: ClarificationOption[] = context.activeOutputGroup.map(
        (output) => ({
          label: `Image #${output.index}`,
          value: `select_${output.assetId}`,
          assetId: output.assetId,
          description: `Output #${output.index}`,
        }),
      );
      return {
        resolved: false,
        confidence: "AMBIGUOUS",
        clarification: {
          question: `You asked for image #${parsedIndex}, but only ${context.activeOutputGroup.length} images are in this set. Which image would you like to use?`,
          options,
        },
      };
    }
  }

  // Priority 3: Currently UI-selected asset in context
  if (context.selectedAssetId) {
    const verified = await db.asset.findFirst({
      where: {
        id: context.selectedAssetId,
        organizationId,
        status: "READY",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (verified) {
      return { resolved: true, assetId: verified.id, confidence: "HIGH" };
    }
  }

  // Priority 4: If single active output in group
  if (context.activeOutputGroup.length === 1) {
    const single = context.activeOutputGroup[0]!;
    return { resolved: true, assetId: single.assetId, confidence: "HIGH" };
  }

  // Priority 5: Relative latest reference ("the last one", "it", "this")
  if (isRelativeLatestReference(text)) {
    if (context.activeOutputGroup.length > 1) {
      // Ambiguous because multiple outputs exist in the current set!
      const options: ClarificationOption[] = context.activeOutputGroup.map(
        (output) => ({
          label: `Image #${output.index}`,
          value: `select_${output.assetId}`,
          assetId: output.assetId,
          description: `Output #${output.index}`,
        }),
      );
      return {
        resolved: false,
        confidence: "AMBIGUOUS",
        clarification: {
          question:
            "There are multiple generated images in the current set. Which one would you like to use?",
          options,
        },
      };
    }
    if (context.activeOutputGroup.length === 1) {
      return {
        resolved: true,
        assetId: context.activeOutputGroup[0]!.assetId,
        confidence: "HIGH",
      };
    }
  }

  // If no output group exists at all
  if (context.activeOutputGroup.length === 0) {
    return {
      resolved: false,
      confidence: "AMBIGUOUS",
      clarification: {
        question:
          "There are no active generated assets in this conversation yet. Please create an initial image or video first.",
        options: [],
      },
    };
  }

  // Fallback: If ambiguous
  const options: ClarificationOption[] = context.activeOutputGroup.map(
    (output) => ({
      label: `Image #${output.index}`,
      value: `select_${output.assetId}`,
      assetId: output.assetId,
      description: `Output #${output.index}`,
    }),
  );
  return {
    resolved: false,
    confidence: "AMBIGUOUS",
    clarification: {
      question: "Which image in the active set would you like to work with?",
      options,
    },
  };
}
