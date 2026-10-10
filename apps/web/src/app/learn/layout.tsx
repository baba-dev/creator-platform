import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/ui/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import "@/components/learn/learn.css";
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <Brand />
          <nav
            aria-label="Learn navigation"
            className="flex items-center gap-5 text-sm"
          >
            <Link href="/learn" className="font-semibold text-primary">
              Learn
            </Link>
            <ThemeToggle />
            <Button asChild size="sm">
              <Link href="/app">Open studio</Link>
            </Button>
          </nav>
        </div>
      </header>
      {children}
      <footer className="mt-20 border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-6 px-5 py-10">
          <div>
            <Brand />
            <p className="mt-3 text-sm text-muted-foreground">
              A little inspiration. A lot you can make.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-6 text-sm">
            <Link href="/learn">All articles</Link>
            <Link href="/learn/feed" prefetch={false}>
              RSS feed
            </Link>
            <Link href="/privacy-policy">Privacy</Link>
            <Link href="/terms-of-service">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
