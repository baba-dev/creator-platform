export type ProviderRuntimeReadiness = {
  configured: boolean;
  reason: "READY" | "MISSING_CREDENTIALS";
};

export type ProviderEnvironment = Readonly<Record<string, string | undefined>>;

type ReadinessInput = {
  provider: string;
  mediaKind: string;
  providerModelId: string;
};

function configured(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export function getProviderRuntimeReadiness(
  input: ReadinessInput,
  environment: ProviderEnvironment = process.env,
): ProviderRuntimeReadiness {
  const provider = input.provider.toUpperCase();
  const mediaKind = input.mediaKind.toUpperCase();

  let ready = false;
  switch (provider) {
    case "BYTEPLUS":
      if (mediaKind === "VOICE") {
        ready = configured(environment.BYTEPLUS_SPEECH_API_KEY);
      } else if (
        mediaKind === "VIDEO" &&
        input.providerModelId === "omnihuman-1.5"
      ) {
        ready =
          configured(environment.BYTEPLUS_VISION_ACCESS_KEY_ID) &&
          configured(environment.BYTEPLUS_VISION_SECRET_ACCESS_KEY);
      } else {
        ready = configured(environment.BYTEPLUS_API_KEY);
      }
      break;
    case "NVIDIA":
      ready = configured(environment.NVIDIA_API_KEY) &&
        (mediaKind !== "TEXT" || environment.NVIDIA_COMMERCIAL_USE_ENABLED === "true");
      break;
    case "GROQ":
      ready = configured(environment.GROQ_API_KEY);
      break;
    case "GEMINI":
      ready = configured(environment.GEMINI_API_KEY);
      break;
    case "CLOUDFLARE":
      ready =
        configured(environment.CLOUDFLARE_API_TOKEN) &&
        configured(environment.CLOUDFLARE_ACCOUNT_ID);
      break;
    default:
      ready = false;
  }

  return {
    configured: ready,
    reason: ready ? "READY" : "MISSING_CREDENTIALS",
  };
}
