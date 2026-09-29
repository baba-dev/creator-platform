import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";

type BrandProps = {
  compact?: boolean;
  href?: string;
};

/** Approved Creative Cursor identity, selected by the root theme attribute. */
export function Brand({ compact = false, href = "/" }: BrandProps) {
  const asset = compact ? "symbol" : "horizontal";
  const dimensions = compact
    ? { width: 40, height: 35 }
    : { width: 180, height: 60 };

  return (
    <Link
      href={href as Route}
      className="inline-flex min-h-10 shrink-0 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      aria-label="Creators by AIWA home"
    >
      <Image
        src={`/brand/logos/creators-${asset}-black-transparent.webp`}
        alt=""
        aria-hidden="true"
        width={dimensions.width}
        height={dimensions.height}
        unoptimized
        className={
          compact ? "h-auto w-9 dark:hidden" : "h-auto w-40 dark:hidden sm:w-44"
        }
      />
      <Image
        src={`/brand/logos/creators-${asset}-white-transparent.webp`}
        alt=""
        aria-hidden="true"
        width={dimensions.width}
        height={dimensions.height}
        unoptimized
        className={
          compact
            ? "hidden h-auto w-9 dark:block"
            : "hidden h-auto w-40 dark:block sm:w-44"
        }
      />
    </Link>
  );
}
