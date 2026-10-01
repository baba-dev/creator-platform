export const GENERATION_ACTIVITY_EVENT = "aiwa:generation-started";

export function generationActivityStorageKey(organizationId: string) {
  return `aiwa-active-generation:${organizationId}`;
}

export function announceGenerationStarted(
  organizationId: string,
  jobId: string,
) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(generationActivityStorageKey(organizationId), jobId);
  window.dispatchEvent(
    new CustomEvent(GENERATION_ACTIVITY_EVENT, {
      detail: { organizationId, jobId },
    }),
  );
}
