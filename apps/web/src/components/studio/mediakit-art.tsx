// Small, repo-native SVG illustrations; each operation has a distinct silhouette.
export function MediaKitArt({
  tool,
  className = "size-10",
}: {
  tool: string;
  className?: string;
}) {
  const art: Record<string, React.ReactNode> = {
    "compress-image": (
      <>
        <rect x="9" y="12" width="30" height="24" rx="3" />
        <path d="m4 24 9 0m-4-4 4 4-4 4m35-4h-9m4-4-4 4 4 4M18 29l5-6 5 5 4-4" />
      </>
    ),
    "crop-image": (
      <>
        <path d="M13 5v30h30M5 13h30v30M20 7v5m-8 8H7m34 8h-6m-7 8v5" />
        <path d="M20 20h8v8h-8z" opacity=".4" />
      </>
    ),
    "face-blur-image": (
      <>
        <circle cx="24" cy="21" r="12" />
        <path d="M8 43c1-10 31-10 32 0M16 17h16v9H16z" />
        <path d="M20 17v9m4-9v9m4-9v9m-12-5h16" opacity=".5" />
      </>
    ),
    "slim-image": (
      <>
        <path d="M14 7c-4 9 5 11 1 21L11 41m23-34c4 9-5 11-1 21l4 13M5 23h10m-4-4 4 4-4 4m32-4H33m4-4-4 4 4 4" />
      </>
    ),
    "mosaic-image": (
      <>
        {[10, 20, 30].flatMap((x) =>
          [10, 20, 30].map((y) => (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width="8"
              height="8"
              rx="1"
              opacity={(x + y) % 20 ? 0.4 : 1}
            />
          )),
        )}
      </>
    ),
    "add-image-watermark": (
      <>
        <rect x="6" y="9" width="36" height="30" rx="3" />
        <path d="m11 29 8-9 7 7m-9 6h10" />
        <circle cx="32" cy="29" r="7" />
        <path d="m29 29 2 2 4-5" />
      </>
    ),
    "matte-portrait-video": (
      <>
        <rect x="7" y="7" width="34" height="34" rx="4" strokeDasharray="3 4" />
        <circle cx="24" cy="18" r="6" />
        <path d="M13 36c0-14 22-14 22 0z" />
      </>
    ),
    "matte-greenscreen-video": (
      <>
        <path d="M7 7h34v34H7z" strokeDasharray="3 4" />
        <path d="m18 16 16 8-16 8zM3 17h8M37 31h8" />
      </>
    ),
    "lip-sync": (
      <>
        <path d="M8 18c7 5 12-9 16-2 4-7 9 7 16 2-2 19-30 19-32 0zM9 20h30M4 7v5m7-7v9m27-7v5m6-7v9" />
      </>
    ),
    "enhance-video-smoothness": (
      <>
        <path d="m5 17 7-7 7 12 7-9 8 9 9-12" opacity=".4" />
        <path d="M5 33c8-23 13 15 23-2 5-9 9-9 15-3" />
        <path d="m38 24 5 4-6 3" />
      </>
    ),
    "text-to-scrolling-video": (
      <>
        <rect x="8" y="6" width="32" height="36" rx="3" />
        <path d="M14 14h20m-20 7h20m-20 7h10m6-1v9m-4-4 4 4 4-4" />
      </>
    ),
    "assess-video-quality": (
      <>
        <path d="M8 36v-7m9 7V21m9 15V13m9 23V6M6 41h34" />
        <path d="m7 17 9-7 9 2 14-8" />
      </>
    ),
    "semantic-segment": (
      <>
        <rect x="5" y="12" width="38" height="24" rx="3" />
        <path d="M17 12v24m14-24v24M9 20h4m8 8h6m8-10h4" />
        <path d="M17 7v2m14 30v3" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {art[tool] ?? art["compress-image"]}
    </svg>
  );
}
