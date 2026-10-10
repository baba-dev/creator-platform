"use client";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
export function LearnHelp() {
  const path = usePathname();
  const topic = path.includes("/image")
    ? "images"
    : path.includes("/video")
      ? "video"
      : /\/(audio|speech|voice)/.test(path)
        ? "voice"
        : path.includes("/media-tools")
          ? "mediakit"
          : path.includes("/storage")
            ? "workspaces"
            : "getting-started";
  return (
    <div className="px-5 py-4 text-right">
      <Link
        href={`/learn/topics/${topic}` as Route}
        className="inline-flex min-h-10 items-center text-sm font-semibold text-primary"
      >
        Guides & help ↗
      </Link>
    </div>
  );
}
