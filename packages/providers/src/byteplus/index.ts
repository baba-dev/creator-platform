import {
  ProviderConfigurationError,
  type MediaGenerationProvider,
} from "../index";

export interface BytePlusAdapterConfig {
  readonly apiKey: string;
  readonly region: string;
  readonly modelArkBaseUrl?: string;
  readonly speechAppId?: string;
  readonly speechAccessToken?: string;
}

/**
 * Constructs the BytePlus boundary without inventing undocumented endpoints.
 * API operations are implemented in the provider-integration milestone after
 * service activation, SDK choice, and resale scope are confirmed in writing.
 */
export function createBytePlusProvider(
  config: BytePlusAdapterConfig,
): MediaGenerationProvider {
  if (!config.apiKey || !config.region) {
    throw new ProviderConfigurationError(
      "BytePlus API key and region are required",
    );
  }

  return {
    name: "byteplus",
    async listModels() {
      throw new ProviderConfigurationError(
        "BytePlus model discovery is not configured yet",
      );
    },
    async submit() {
      throw new ProviderConfigurationError(
        "BytePlus generation submission is not configured yet",
      );
    },
    async getJob() {
      throw new ProviderConfigurationError(
        "BytePlus job polling is not configured yet",
      );
    },
    async cancel() {
      throw new ProviderConfigurationError(
        "BytePlus cancellation is not configured yet",
      );
    },
  };
}
