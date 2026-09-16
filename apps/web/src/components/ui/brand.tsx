import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="group flex items-center gap-3 text-foreground"
      aria-label="Aiwa Creators home"
    >
      <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-[13px] bg-[var(--gradient-brand)] shadow-[0_10px_35px_color-mix(in_oklch,var(--primary)_28%,transparent)] transition-transform duration-300 ease-creative group-hover:-rotate-3 group-hover:scale-105">
        <span className="absolute -right-2 -top-2 size-6 rounded-full bg-white/35 blur-md" />
        <svg
          aria-hidden="true"
          className="relative size-6 text-on-vivid"
          viewBox="0 0 24 24"
          fill="none"
        >
          <path
            d="M3 17.5 8.2 6l3.7 8.2L15 8l6 9.5"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {compact ? null : (
        <span>
          <span className="font-display block text-[13px] font-bold tracking-[0.12em] text-foreground">
            AIWA CREATORS
          </span>
          <span className="mt-0.5 block text-[10px] font-medium tracking-wide text-muted-foreground">
            AI MEDIA WORKSPACE
          </span>
        </span>
      )}
    </Link>
  );
}
