export type CapabilityValue = boolean | number | string;
export type StudioCapabilities =
  | Record<string, CapabilityValue>
  | null
  | undefined;

export function capabilityValues(
  capabilities: StudioCapabilities,
  prefix: string,
): string[] {
  if (!capabilities) return [];
  const marker = `${prefix}:`;
  return Object.entries(capabilities)
    .filter(([key, value]) => key.startsWith(marker) && value === true)
    .map(([key]) => key.slice(marker.length));
}

export function selectSupportedCapability(
  capabilities: StudioCapabilities,
  prefix: string,
  current: string,
  preferredFallbacks: readonly string[] = [],
): string {
  const values = capabilityValues(capabilities, prefix);
  if (values.includes(current)) return current;
  for (const fallback of preferredFallbacks) {
    if (values.includes(fallback)) return fallback;
  }
  return values[0] ?? "";
}

export function referenceCapabilityLabel(
  capabilities: StudioCapabilities,
): string | null {
  if (capabilities?.referenceImages !== true) return null;
  const maximum = capabilities.maxReferenceImages;
  if (
    typeof maximum === "number" &&
    Number.isSafeInteger(maximum) &&
    maximum > 0
  ) {
    return `Up to ${maximum} references`;
  }
  return "Reference images supported";
}

export function resolutionLabel(value: string): string {
  const labels: Record<string, string> = {
    "1K": "1K · Compact",
    "2K": "2K · High resolution",
    "3K": "3K · Higher resolution",
    "4K": "4K · Maximum detail",
    "720p": "720p · HD Video",
    "1080p": "1080p · Full HD Video",
  };
  return labels[value] ?? value;
}
