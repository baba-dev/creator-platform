"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { MascotScene, type MascotSceneKind } from "./mascot-scene";

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ProcessDialog({
  open,
  mascot,
  eyebrow,
  title,
  description,
  children,
  allowDismiss = true,
  onDismiss,
}: {
  open: boolean;
  mascot: MascotSceneKind;
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
  allowDismiss?: boolean;
  onDismiss?: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const panel = panelRef.current;
    panel?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && allowDismiss) {
        event.preventDefault();
        onDismissRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus.current?.focus();
    };
  }, [allowDismiss, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-foreground/15 p-4 backdrop-blur-[3px]"
      onMouseDown={(event) => {
        if (
          allowDismiss &&
          event.target === event.currentTarget &&
          onDismiss
        ) {
          onDismiss();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="relative w-full max-w-[470px] rounded-[28px] border border-border bg-popover p-5 text-popover-foreground shadow-lg outline-none sm:p-7"
      >
        {allowDismiss && onDismiss ? (
          <button
            type="button"
            aria-label="Dismiss process dialog"
            onClick={onDismiss}
            className="absolute right-4 top-4 z-10 grid size-10 place-items-center rounded-xl border border-border bg-card text-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35"
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : null}

        <MascotScene kind={mascot} size="modal" className="mx-auto" />

        <div className="mx-auto mt-5 max-w-sm text-center">
          <p className="font-mono text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-primary">
            {eyebrow}
          </p>
          <h2
            id={titleId}
            className="font-display mt-2 text-2xl font-semibold tracking-tight text-foreground"
          >
            {title}
          </h2>
          <p
            id={descriptionId}
            className="mt-2 text-sm leading-6 text-muted-foreground"
          >
            {description}
          </p>
        </div>

        {children ? <div className="mt-6">{children}</div> : null}
      </div>
    </div>
  );
}
