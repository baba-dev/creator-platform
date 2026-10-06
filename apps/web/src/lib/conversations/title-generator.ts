import { db } from "@aiwa/db";
import { createNvidiaProvider } from "@aiwa/providers/nvidia";

export const TITLE_UPDATED_EVENT = "aiwa:conversation-title-updated";

/**
 * Extracts the first meaningful paragraph from a user message.
 */
export function extractFirstParagraph(text: string): string {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paragraphs[0] ?? text.trim();
}

/**
 * Derives a clean deterministic fallback title of 3–7 words from the prompt.
 */
export function deriveDeterministicTitle(prompt: string): string {
  const paragraph = extractFirstParagraph(prompt);
  // Strip common conversational request prefixes
  const stripped = paragraph
    .replace(
      /^(?:please\s+)?(?:create|generate|make|design|produce|draw|render|give\s+me)\s+(?:a|an|the|some)?\s+/i,
      "",
    )
    .replace(
      /^(?:a|an|the)?\s*(?:cinematic\s+)?(?:product\s+)?photo(?:graph)?\s+(?:of|in)?\s+/i,
      "",
    )
    .replace(/^cinematic\s+photo(?:graph)?\s+of\s+(?:a|an|the)?\s+/i, "")
    .replace(/^photo(?:graph)?\s+of\s+(?:a|an|the)?\s+/i, "")
    .trim();

  const words = stripped
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}'’-]/gu, ""))
    .filter(Boolean);

  if (words.length === 0) {
    return "New creation";
  }

  // Select 3 to 6 words
  const selected = words.slice(0, Math.min(6, Math.max(3, words.length)));
  const title = selected
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  return title.slice(0, 80);
}

const TITLE_SYSTEM_PROMPT = `You are a creative titling engine for Aiwa Creator platform.
Your task is to generate a concise, evocative creative project title based on the user's creative prompt.
Rules:
1. Title must be strictly 3 to 7 words.
2. Describe the project or subject matter directly (e.g., "Omani Desert Product Shoot", "Toy Store Mascot Character", "Ramadan Perfume Campaign").
3. NEVER repeat instructions (do NOT say "User Wants An Image" or "Create A Photograph").
4. Return ONLY the title text in plain text. No quotes, no preamble, no markdown formatting.`;

/**
 * Asynchronously generates an AI title using NVIDIA Nemotron Nano with sponsored: true.
 * If NVIDIA is unavailable or times out, falls back to the deterministic title.
 */
export async function generateConversationTitle(params: {
  conversationId: string;
  initialPrompt: string;
}): Promise<string> {
  const { conversationId, initialPrompt } = params;
  const fallback = deriveDeterministicTitle(initialPrompt);

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    // If NVIDIA is not configured, apply fallback to DB
    await updateThreadTitle(conversationId, fallback, fallback);
    return fallback;
  }

  try {
    const nvidia = createNvidiaProvider({
      apiKey,
      baseUrl:
        process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
      defaultModel: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
      requestTimeoutMs: 7000,
    });

    const paragraph = extractFirstParagraph(initialPrompt);
    const result = await nvidia.complete({
      idempotencyKey: `title-${conversationId}`,
      modelId: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
      systemPrompt: TITLE_SYSTEM_PROMPT,
      userPrompt: `Creative Prompt:\n${paragraph}`,
      responseSchemaName: "title_generation",
    });

    let rawTitle = "";
    if (typeof result.content === "string") {
      rawTitle = result.content;
    } else if (
      result.content &&
      typeof result.content === "object" &&
      "title" in (result.content as Record<string, unknown>)
    ) {
      rawTitle = String((result.content as Record<string, unknown>).title);
    } else {
      rawTitle = JSON.stringify(result.content);
    }

    const cleaned = rawTitle
      .replace(/["*#`]/g, "")
      .replace(/^title:\s*/i, "")
      .trim();

    const wordCount = cleaned.split(/\s+/).length;
    const finalTitle =
      cleaned.length >= 3 && wordCount >= 2 && wordCount <= 10
        ? cleaned
        : fallback;

    await updateThreadTitle(conversationId, finalTitle, fallback);
    return finalTitle;
  } catch {
    // Fall back deterministically without failing the conversation
    await updateThreadTitle(conversationId, fallback, fallback);
    return fallback;
  }
}

async function updateThreadTitle(
  conversationId: string,
  title: string,
  expectedCurrentTitle: string,
): Promise<void> {
  try {
    // Do not let a delayed AI title overwrite a title the user already renamed.
    await db.chatThread.updateMany({
      where: {
        id: conversationId,
        title: expectedCurrentTitle,
      },
      data: { title },
    });
  } catch {
    // Ignore update failures
  }
}
