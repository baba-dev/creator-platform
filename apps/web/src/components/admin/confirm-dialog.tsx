"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  triggerLabel,
  title,
  description,
  confirmLabel,
  onConfirm,
  disabled = false,
  destructive = false,
}: {
  triggerLabel: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const triggerId = useId();
  const cancelId = useId();
  const confirmId = useId();

  useEffect(() => {
    if (!open) return;
    document.getElementById(cancelId)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        document.getElementById(triggerId)?.focus();
      } else if (event.key === "Tab") {
        event.preventDefault();
        const targetId =
          document.activeElement?.id === cancelId ? confirmId : cancelId;
        document.getElementById(targetId)?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [cancelId, confirmId, open, triggerId]);

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => document.getElementById(triggerId)?.focus());
  };
  return (
    <>
      <Button
        id={triggerId}
        type="button"
        disabled={disabled}
        variant="secondary"
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </Button>
      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/20 p-4"
          onMouseDown={close}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lg"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id={titleId} className="font-display text-xl font-semibold">
              {title}
            </h2>
            <p
              id={descriptionId}
              className="mt-2 text-sm leading-6 text-muted-foreground"
            >
              {description}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button id={cancelId} variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button
                id={confirmId}
                disabled={pending}
                className={
                  destructive
                    ? "border-destructive/20 bg-destructive text-white hover:bg-destructive/90"
                    : undefined
                }
                onClick={async () => {
                  setPending(true);
                  try {
                    await onConfirm();
                    close();
                  } finally {
                    setPending(false);
                  }
                }}
              >
                {pending ? "Working…" : confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
