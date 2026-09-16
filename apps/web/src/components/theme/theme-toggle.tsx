"use client";

import { useSyncExternalStore } from "react";

import { Icon } from "@/components/ui/icon";

type Theme = "light" | "dark";

const storageKey = "aiwa-theme";

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribeToTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    currentTheme,
    () => "dark" as const,
  );

  function toggleTheme() {
    const nextTheme: Theme = currentTheme() === "dark" ? "light" : "dark";
    const root = document.documentElement;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const applyTheme = () => {
      root.dataset.theme = nextTheme;
      root.style.colorScheme = nextTheme;
      localStorage.setItem(storageKey, nextTheme);
    };

    root.classList.add("theme-transition");

    const transitionDocument = document as Document & {
      startViewTransition?: (callback: () => void) => {
        finished: Promise<void>;
      };
    };

    if (!reduceMotion && transitionDocument.startViewTransition) {
      transitionDocument
        .startViewTransition(applyTheme)
        .finished.finally(() => {
          root.classList.remove("theme-transition");
        });
      return;
    }

    applyTheme();
    window.setTimeout(() => root.classList.remove("theme-transition"), 320);
  }

  const isDark = theme === "dark";
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`group relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-card/80 text-muted-foreground shadow-sm backdrop-blur-md transition-[transform,color,border-color,background-color] duration-200 hover:-rotate-3 hover:scale-105 hover:border-primary/45 hover:text-primary focus-visible:outline-none ${className}`}
      aria-label={label}
      title={label}
    >
      <Icon
        name={isDark ? "sun" : "moon"}
        className="size-[17px] transition-transform duration-300 group-hover:rotate-12"
      />
      <span className="sr-only">{label}</span>
    </button>
  );
}
