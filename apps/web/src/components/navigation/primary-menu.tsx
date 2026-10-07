"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";

interface MenuItem {
  title: string;
  description: string;
  href: string;
  icon: IconName;
  badge?: string;
}

interface MenuCategory {
  label: string;
  key: "image" | "video" | "audio" | "creative";
  icon: IconName;
  items: MenuItem[];
}

export function PrimaryMenu({ slug }: { slug: string }) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const base = `/app/${encodeURIComponent(slug)}`;

  const categories: MenuCategory[] = [
    {
      label: "Image",
      key: "image",
      icon: "image",
      items: [
        {
          title: "Image Studio",
          description:
            "Generate photorealistic art, products & visual concepts",
          href: `${base}/image`,
          icon: "image",
        },
        {
          title: "Precision Image Studio",
          description:
            "AI retouching, layered PSD composition, crop, resize & transforms",
          href: `${base}/image/precision`,
          icon: "wand",
          badge: "Edit",
        },
      ],
    },
    {
      label: "Video",
      key: "video",
      icon: "video",
      items: [
        {
          title: "Video Studio",
          description:
            "Cinematic text-to-video & image-to-video camera control",
          href: `${base}/video`,
          icon: "video",
        },
        {
          title: "AI Spokesperson",
          description: "Realistic talking presenters and branded avatars",
          href: `${base}/spokesperson`,
          icon: "sparkles",
          badge: "New",
        },
        {
          title: "Video Editing Desk",
          description: "Trim, reorder, frame, caption, mix, and export videos",
          href: `${base}/video/editor`,
          icon: "director",
        },
      ],
    },
    {
      label: "Audio",
      key: "audio",
      icon: "voice",
      items: [
        {
          title: "Voice Studio",
          description: "Neural voice narration and multilingual synthesis",
          href: `${base}/speech`,
          icon: "voice",
        },
        {
          title: "Speech / Transcription",
          description: "Transcribe audio or video and export SRT/VTT subtitles",
          href: `${base}/speech/transcription`,
          icon: "script",
        },
        {
          title: "Voice Casting Booth",
          description: "Audition, compare, and cast verified voices",
          href: `${base}/speech/voices`,
          icon: "sparkles",
        },
        {
          title: "Realtime Voice Persona",
          description: "Interactive conversational voice calls & roleplay",
          href: `${base}/chat`,
          icon: "chat",
        },
      ],
    },
    {
      label: "Creative",
      key: "creative",
      icon: "wand",
      items: [
        {
          title: "Creative Director",
          description: "Multimodal story direction and storyboard generation",
          href: `${base}/director`,
          icon: "director",
        },
        {
          title: "Scriptwriter",
          description: "Screenplays, narrative dialogue, and commercial ads",
          href: `${base}/scripts`,
          icon: "script",
        },
        {
          title: "Brand & Story Assistants",
          description: "Train brand guidelines and bespoke creative voices",
          href: `${base}/brand-assistants`,
          icon: "brand",
        },
        {
          title: "Story Planner",
          description:
            "Three-act beat sheets, narrative arcs, and character bible",
          href: `${base}/story-planning`,
          icon: "story",
        },
        {
          title: "Generation Templates",
          description: "Ready-to-use proven pipelines and community recipes",
          href: `${base}/templates`,
          icon: "wand",
        },
      ],
    },
  ];

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpenCategory(null);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenCategory(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Close when navigating
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setOpenCategory(null);
  }

  return (
    <div
      ref={containerRef}
      className="relative flex items-center gap-1.5"
      role="navigation"
      aria-label="Primary Creation Menu"
    >
      {/* Quick Create Highlight Button */}
      <Link
        href={`${base}#create` as Route}
        className="group relative inline-flex h-9 items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3.5 text-xs font-bold text-primary shadow-xs transition hover:border-primary/60 hover:bg-primary/15 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="grid size-4 place-items-center rounded-full bg-primary/20 text-primary transition group-hover:scale-110">
          <Icon name="plus" className="size-3" />
        </span>
        <span className="tracking-wide">Quick Create</span>
      </Link>

      <div className="mx-1 h-4 w-px bg-border/60" aria-hidden="true" />

      {/* Main Categories */}
      {categories.map((cat) => {
        const isOpen = openCategory === cat.key;
        const isCurrentCategory =
          (cat.key === "image" && pathname.includes("/image")) ||
          (cat.key === "video" &&
            (pathname.includes("/video") ||
              pathname.includes("/spokesperson"))) ||
          (cat.key === "audio" && pathname.includes("/speech")) ||
          (cat.key === "creative" &&
            (pathname.includes("/director") ||
              pathname.includes("/scripts") ||
              pathname.includes("/brand") ||
              pathname.includes("/templates") ||
              pathname.includes("/story-planning")));

        return (
          <div key={cat.key} className="relative">
            <button
              type="button"
              onClick={() => setOpenCategory(isOpen ? null : cat.key)}
              aria-expanded={isOpen}
              aria-haspopup="true"
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-ring ${
                isOpen || isCurrentCategory
                  ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                  : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
              }`}
            >
              <Icon name={cat.icon} className="size-3.5" />
              <span>{cat.label}</span>
              {isCurrentCategory && (
                <span
                  className="size-1.5 rounded-full bg-primary"
                  aria-hidden="true"
                />
              )}
              <Icon
                name="chevron"
                className={`size-3 transition-transform duration-200 ${
                  isOpen ? "rotate-90" : ""
                }`}
              />
            </button>

            {/* Dropdown Popover */}
            {isOpen && (
              <div
                className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-border bg-card/95 p-2 shadow-lg backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
                role="menu"
                aria-orientation="vertical"
              >
                <div className="mb-1.5 flex items-center justify-between px-2.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>{cat.label} Tools</span>
                  <span className="text-[10px] text-primary">
                    {cat.items.length} apps
                  </span>
                </div>
                <div className="space-y-1">
                  {cat.items.map((item) => (
                    <Link
                      key={item.title}
                      href={item.href as Route}
                      role="menuitem"
                      onClick={() => setOpenCategory(null)}
                      className="group flex items-start gap-3 rounded-xl p-2 text-left transition hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-border/80 bg-background text-muted-foreground transition group-hover:border-primary/40 group-hover:bg-primary/10 group-hover:text-primary">
                        <Icon name={item.icon} className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-semibold text-foreground group-hover:text-primary">
                            {item.title}
                          </span>
                          {item.badge && (
                            <span className="rounded-md border border-primary/30 bg-primary/10 px-1 py-0.2 text-[9px] font-bold uppercase tracking-wide text-primary">
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <p className="line-clamp-1 text-[11px] text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Direct Quicklinks: History & Help */}
      <div className="mx-1 h-4 w-px bg-border/60" aria-hidden="true" />
      <Link
        href={`${base}/history` as Route}
        title="Generation History"
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-ring ${
          pathname.includes("/history")
            ? "bg-card text-foreground shadow-xs ring-1 ring-border"
            : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
        }`}
      >
        <Icon name="activity" className="size-3.5" />
        <span className="hidden xl:inline">History</span>
      </Link>
    </div>
  );
}
