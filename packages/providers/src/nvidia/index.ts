import { ProviderConfigurationError, type ReasoningProvider } from "../index";

export interface NvidiaAdapterConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly defaultModel: string;
}

/**
 * Creates the reasoning boundary. The concrete HTTP client arrives with the
 * Creative Copilot milestone so schema validation, rate limits, and redaction
 * are introduced together.
 */
export function createNvidiaProvider(
  config: NvidiaAdapterConfig,
): ReasoningProvider {
  if (!config.apiKey || !config.baseUrl || !config.defaultModel) {
    throw new ProviderConfigurationError(
      "NVIDIA API key, base URL, and model are required",
    );
  }

  return {
    name: "nvidia",
    async complete() {
      throw new ProviderConfigurationError(
        "NVIDIA reasoning requests are not configured yet",
      );
    },
  };
}
