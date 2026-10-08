import type { ConversationPlannerContext } from "./context-builder";

/**
 * A bounded, deterministic answer for read-only creative questions.
 * This does not pretend to be open-ended LLM chat and can never spend credits.
 */
export function answerCreativeQuestion(
  question: string,
  context: ConversationPlannerContext,
): string {
  const lower = question.toLowerCase();
  const model =
    context.currentModelName || context.currentModelId || "the selected model";
  const count = context.activeOutputGroup.length;
  if (
    /\\b(?:which|what)\\s+model\\b|\\bmodel\\s+(?:did|is|was)\\b/i.test(lower)
  ) {
    return `The selected ${context.activeModality.toLowerCase()} model is ${model}${context.currentProvider ? ` (${context.currentProvider})` : ""}. I can help you switch models or open the specialist Studio to compare settings.`;
  }
  if (
    /\\b(?:what|which)\\s+(?:size|resolution|aspect|ratio)\\b|\\b(?:resolution|ratio)\\s+(?:is|did|was)\\b/i.test(
      lower,
    )
  ) {
    return `Current settings: ${context.currentSettings.aspectRatio ?? "default"} aspect ratio, ${context.currentSettings.resolution ?? "model default"} resolution. To change these, try “Make it 9:16” or “Set resolution to 2K”.`;
  }
  if (
    /\\b(?:how many|number of)\\s+(?:images|outputs|variations)\\b/i.test(lower)
  ) {
    return `The selected generation has ${count} ready ${count === 1 ? "output" : "outputs"}. You can select a numbered output before editing or animating it.`;
  }
  if (
    /\\b(?:enhance|improve|optimi[sz]e)\\s+(?:my |the )?prompt\\b/i.test(lower)
  ) {
    return "Prompt enhancement is available in the Image, Video and Speech Studios. Open the relevant Studio to review the enhanced prompt before generating; this conversation will not bill you for an unsupported shortcut.";
  }
  if (/\\blast frame\\b/i.test(lower)) {
    return "For first-and-last-frame video generation, open Video Studio to select and validate both frames. This conversation does not yet safely support that multi-source workflow.";
  }
  return "I can help refine the current creative work: select an output, edit an image, create variations, animate it, extend a video, adjust settings, or switch models. For open-ended consultation, use Creative Director or Character Chat. I won't start a paid generation from a question; give an explicit creative instruction when you're ready.";
}
