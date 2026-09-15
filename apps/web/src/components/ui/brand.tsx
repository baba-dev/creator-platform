import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="group flex items-center gap-3"
      aria-label="Aiwa Creators home"
    >
      <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-[13px] bg-[linear-gradient(135deg,#7c3aed,#06b6d4)] shadow-[0_10px_35px_rgba(79,70,229,.35)]">
        <span className="absolute -right-2 -top-2 size-6 rounded-full bg-white/35 blur-md" />
        <svg
          aria-hidden="true"
          className="relative size-6 text-white"
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
          <span className="block text-[13px] font-bold tracking-[0.12em] text-white">
            AIWA CREATORS
          </span>
          <span className="mt-0.5 block text-[10px] font-medium tracking-wide text-slate-500">
            AI MEDIA WORKSPACE
          </span>
        </span>
      )}
    </Link>
  );
}
