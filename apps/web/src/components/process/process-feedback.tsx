import { cn } from "@/lib/utils";

import { MascotScene, type MascotSceneKind } from "./mascot-scene";

type ProcessFeedbackKind = "loading" | "delayed" | "recoverable" | "error";

const presentation: Record<
  ProcessFeedbackKind,
  { mascot: MascotSceneKind; role: "status" | "alert"; className: string }
> = {
  loading: {
    mascot: "running",
    role: "status",
    className: "border-info/25 bg-info/5",
  },
  delayed: {
    mascot: "confused",
    role: "status",
    className: "border-warning/30 bg-warning/5",
  },
  recoverable: {
    mascot: "confused",
    role: "status",
    className: "border-info/25 bg-info/5",
  },
  error: {
    mascot: "confused",
    role: "alert",
    className: "border-destructive/30 bg-destructive/5",
  },
};

export function ProcessFeedback({
  kind,
  title,
  description,
  className,
}: {
  kind: ProcessFeedbackKind;
  title: string;
  description: string;
  className?: string;
}) {
  const view = presentation[kind];
  return (
    <div
      role={view.role}
      aria-live={view.role === "status" ? "polite" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-2xl border p-3.5",
        view.className,
        className,
      )}
    >
      <MascotScene kind={view.mascot} size="compact" />
      <div className="min-w-0">
        <p className="font-display text-sm font-semibold text-foreground">
          {title}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
