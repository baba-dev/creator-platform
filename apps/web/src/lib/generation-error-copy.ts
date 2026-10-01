export type GenerationErrorPresentation = {
  title: string;
  description: string;
  nextStep: string | null;
};

type ErrorInput = {
  errorCode?: string | null;
  errorMessage?: string | null;
  status?: string | null;
};

function startsWithAny(value: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

export function getGenerationErrorPresentation({
  errorCode,
  errorMessage,
  status,
}: ErrorInput): GenerationErrorPresentation | null {
  const code = errorCode?.trim() ?? "";

  if (
    code.includes("PolicyViolation") &&
    code.includes("SensitiveContentDetected")
  ) {
    return {
      title: "Content was blocked by provider policy",
      description:
        "The provider detected content that may conflict with its content or copyright restrictions.",
      nextStep:
        "Replace the affected prompt or reference media and generate again.",
    };
  }

  if (
    code.includes("PrivacyInformation") &&
    code.includes("SensitiveContentDetected")
  ) {
    return {
      title: "Reference media was blocked for privacy reasons",
      description:
        "The provider detected a real-person privacy restriction in the supplied reference media.",
      nextStep:
        "Use different reference media or remove the restricted reference and try again.",
    };
  }

  if (
    code.includes("DeepFake") &&
    code.includes("OutputImageSensitiveContentDetected")
  ) {
    return {
      title: "Generated image was blocked by the safety filter",
      description:
        "The provider detected output that may resemble restricted documents, credentials, or impersonation content.",
      nextStep:
        "Change the request so it does not ask for restricted document or identity-like output.",
    };
  }

  if (
    code === "OutputImageSensitiveContentDetected" ||
    code.startsWith("OutputImageSensitiveContentDetected.")
  ) {
    return {
      title: "Generated image was blocked by the safety filter",
      description:
        "The provider flagged the generated image as potentially sensitive. This can happen even when the prompt itself is acceptable.",
      nextStep:
        "Try rewording the prompt or changing reference images, then generate again.",
    };
  }

  if (
    code === "OutputVideoSensitiveContentDetected" ||
    code.startsWith("OutputVideoSensitiveContentDetected.")
  ) {
    return {
      title: "Generated video was blocked by the safety filter",
      description:
        "The provider flagged the generated video as potentially sensitive before it could be returned.",
      nextStep:
        "Try adjusting the prompt, source frames, or reference video before generating again.",
    };
  }

  if (
    code === "OutputAudioSensitiveContentDetected" ||
    code.startsWith("OutputAudioSensitiveContentDetected.")
  ) {
    return {
      title: "Generated audio was blocked by the safety filter",
      description:
        "The provider flagged the generated audio as potentially sensitive before it could be returned.",
      nextStep: "Try revising the input text and generate again.",
    };
  }

  if (
    code === "OutputTextSensitiveContentDetected" ||
    code.startsWith("OutputTextSensitiveContentDetected.")
  ) {
    return {
      title: "Generated text was blocked by the safety filter",
      description:
        "The provider flagged the generated text as potentially sensitive before it could be returned.",
      nextStep: "Try revising the request and generate again.",
    };
  }

  if (
    code === "SensitiveContentDetected" ||
    startsWithAny(code, [
      "InputTextSensitiveContentDetected",
      "InputImageSensitiveContentDetected",
      "InputVideoSensitiveContentDetected",
      "InputAudioSensitiveContentDetected",
    ])
  ) {
    const inputKind = code.startsWith("InputImage")
      ? "reference image"
      : code.startsWith("InputVideo")
        ? "reference video"
        : code.startsWith("InputAudio")
          ? "audio input"
          : "prompt";

    return {
      title: "Input was blocked by the safety filter",
      description: `The provider flagged the ${inputKind} as potentially sensitive or restricted.`,
      nextStep:
        "Change the flagged input or wording and try the generation again.",
    };
  }

  if (
    code === "InvalidParameter.TaskTypeMismatch" ||
    code === "InvalidParameter.TaskTypeConstraint"
  ) {
    return {
      title: "Prompt and generation mode do not match",
      description:
        "The provider classified the request as a different task type from the selected video workflow.",
      nextStep:
        "Adjust the prompt or source media so they match the selected generation mode.",
    };
  }

  if (
    code === "InvalidParameter" ||
    code.startsWith("InvalidParameter.") ||
    code === "MissingParameter" ||
    code.startsWith("MissingParameter.")
  ) {
    return {
      title: "Generation settings were not accepted",
      description:
        "One or more request settings were rejected by the provider or were incompatible with this generation mode.",
      nextStep:
        "Refresh the page, review the selected model settings and inputs, then try again. If it repeats, use the job reference when contacting support.",
    };
  }

  if (
    code === "InvalidImageURL.EmptyURL" ||
    code === "InvalidImageURL.InvalidFormat"
  ) {
    return {
      title: "A reference image could not be read",
      description:
        "The provider could not parse one of the supplied reference images.",
      nextStep: "Remove or replace the affected reference image and try again.",
    };
  }

  if (code === "OutofContextError") {
    return {
      title: "The request is too large for this model",
      description:
        "The combined prompt and reference media exceeded the model's supported context size.",
      nextStep:
        "Shorten the prompt or use fewer or smaller reference inputs, then try again.",
    };
  }

  if (
    code === "AuthenticationError" ||
    code === "InvalidEndpoint.ClosedEndpoint" ||
    code === "InvalidEndpointOrModel.ModelIDAccessDisabled" ||
    code === "UnsupportedModel"
  ) {
    return {
      title: "Generation provider is temporarily unavailable",
      description:
        "The provider connection or model access is unavailable for this request.",
      nextStep:
        "You do not need to change the prompt. Try again later or contact support if the issue continues.",
    };
  }

  if (code === "PROVIDER_OUTCOME_UNKNOWN") {
    return {
      title: "Provider result needs review",
      description:
        "The app could not safely confirm whether the provider completed the request, so it was not automatically submitted again.",
      nextStep:
        "Credits remain reserved while the job is reviewed. Do not resubmit the same request solely because this message appeared.",
    };
  }

  if (
    code === "STORAGE_WRITE_FAILED" ||
    code === "STORAGE_RECOVERY_FAILED" ||
    code === "AUDIO_STORAGE_METADATA_INVALID"
  ) {
    return {
      title: "Generated media could not be saved safely",
      description:
        "The provider result may exist, but the app could not safely write or verify the media in persistent storage.",
      nextStep:
        "Credits remain protected while storage recovery or review completes.",
    };
  }

  if (code === "MISSING_PROVIDER_USAGE") {
    return {
      title: "Provider usage needs review",
      description:
        "The provider completed the media but did not return the usage information required to settle the final charge safely.",
      nextStep:
        "The job is held for review and will not be charged beyond its reserved amount.",
    };
  }

  if (code === "INVALID_PROVIDER_RESPONSE") {
    return {
      title: "Provider returned an unexpected response",
      description:
        "The app could not safely verify the provider result, so it stopped instead of guessing or replaying the request.",
      nextStep:
        "Open the job details or contact support if the issue continues.",
    };
  }

  if (!errorCode && !errorMessage) return null;

  const fallbackDescription =
    errorMessage?.trim() ||
    (status === "MANUAL_REVIEW"
      ? "This generation needs manual review before it can be safely finalized."
      : "The generation could not be completed.");

  return {
    title:
      status === "MANUAL_REVIEW"
        ? "This generation needs attention"
        : "Generation could not be completed",
    description: fallbackDescription,
    nextStep:
      status === "MANUAL_REVIEW"
        ? "Open the job details for the latest recovery and billing status."
        : "Review the request and try again. If the issue repeats, use the job reference when contacting support.",
  };
}
