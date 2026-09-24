"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Preferences = {
  generationCompleted: boolean;
  generationFailed: boolean;
  reports: boolean;
};

export function NotificationPreferencesForm({
  initial,
}: {
  initial: Preferences;
}) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  async function save() {
    setState("saving");
    const response = await fetch("/api/account/notification-preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
    });
    setState(response.ok ? "saved" : "error");
  }

  const options = [
    {
      key: "generationCompleted" as const,
      title: "Generation completed",
      description:
        "Receive a link when an image, video, or voice generation is ready.",
    },
    {
      key: "generationFailed" as const,
      title: "Generation failed",
      description:
        "Receive a message when a generation cannot be completed and needs attention.",
    },
    {
      key: "reports" as const,
      title: "Reports and summaries",
      description:
        "Receive routine platform reports and summaries when those features are enabled.",
    },
  ];

  return (
    <div className="space-y-4">
      {options.map((option) => (
        <label
          key={option.key}
          className="flex cursor-pointer items-start justify-between gap-5 rounded-2xl border border-border bg-card p-5"
        >
          <span>
            <span className="block text-sm font-semibold">{option.title}</span>
            <span className="mt-1 block max-w-2xl text-xs leading-5 text-muted-foreground">
              {option.description}
            </span>
          </span>
          <input
            type="checkbox"
            checked={value[option.key]}
            onChange={(event) => {
              setValue((current) => ({
                ...current,
                [option.key]: event.target.checked,
              }));
              setState("idle");
            }}
            className="mt-1 size-5 accent-primary"
          />
        </label>
      ))}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={() => void save()}
          disabled={state === "saving"}
        >
          {state === "saving" ? "Saving…" : "Save preferences"}
        </Button>
        {state === "saved" ? (
          <span className="text-xs text-success">Preferences saved.</span>
        ) : null}
        {state === "error" ? (
          <span className="text-xs text-destructive">
            Could not save preferences.
          </span>
        ) : null}
      </div>
    </div>
  );
}
