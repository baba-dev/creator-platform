export type WorkerRole = "all" | "core" | "orchestration" | "mail" | "media";
export function workerQueues(role: WorkerRole): string[] {
  return [
    ...(role === "all" || role === "core" || role === "orchestration"
      ? ["maintenance", "generation", "reasoning", "provider-tools"]
      : []),
    ...(role === "all" || role === "core" || role === "mail" ? ["mail"] : []),
    ...(role === "all" || role === "media" ? ["asset-ingestion"] : []),
  ];
}
