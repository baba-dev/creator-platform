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

  type Candidate = { index: number; offset: number };
  const candidates: Candidate[] = [];
  const addCandidate = (match: RegExpExecArray | null, group = 1) => {
    const raw = match?.[group];
    if (!match || !raw) return;
    candidates.push({
      index: Number.parseInt(raw, 10),
      offset: match.index,
    });
  };

  // Explicit numeric references are unambiguous, including "frame 2".
  addCandidate(
    /\b(?:image|picture|output|version|result|frame)\s*#?\s*([1-9]\d?)\b/i.exec(
      normalized,
    ),
  );
  addCandidate(
    /\b([1-9]\d?)(?:st|nd|rd|th)?\s+(?:image|picture|output|one|version|result)\b/i.exec(
      normalized,
    ),
  );
  addCandidate(/#([1-9]\d?)\b/i.exec(normalized));

  const ordinals: Record<string, number> = {
    first: 1,
    "1st": 1,
    second: 2,
    "2nd": 2,
    third: 3,
    "3rd": 3,
    fourth: 4,
    "4th": 4,
    fifth: 5,
    "5th": 5,
    sixth: 6,
    "6th": 6,
    seventh: 7,
    "7th": 7,
    eighth: 8,
    "8th": 8,
    ninth: 9,
    "9th": 9,
    tenth: 10,
    "10th": 10,
  };

  for (const [word, index] of Object.entries(ordinals)) {
    // Bind word ordinals to an actual output noun. Do not treat "first frame"
    // as output #1 in a sentence such as "use the second image as first frame".
    const beforeNoun = new RegExp(
      `\\b(?:the\\s+)?${word}\\s+(?:image|picture|output|version|result)\\b`,
      "i",
    ).exec(normalized);
    if (beforeNoun) {
      candidates.push({ index, offset: beforeNoun.index });
    }

    const afterNoun = new RegExp(
      `\\b(?:image|picture|output|version|result)\\s+(?:#\\s*)?${word}\\b`,
      "i",
    ).exec(normalized);
    if (afterNoun) {
      candidates.push({ index, offset: afterNoun.index });
    }

    const oneForm = new RegExp(`\\b(?:the\\s+)?${word}\\s+one\\b`, "i").exec(
      normalized,
    );
    if (oneForm) {
      candidates.push({ index, offset: oneForm.index });
    }

    if (
      normalized === word ||
      normalized === `the ${word}` ||
      normalized === `${word}.`
    ) {
      candidates.push({ index, offset: 0 });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.offset - b.offset);
  return candidates[0]!.index;
}

export function isRelativeLatestReference(phrase: string): boolean {
  const normalized = phrase.toLowerCase();
  return /\b(?:the\s+(?:last|previous|latest)|that\s+one|this\s+one|this|that|it)\b/i.test(
    normalized,
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
