import Image from "next/image";

import { cn } from "@/lib/utils";

export type MascotSceneKind =
  | "working"
  | "running"
  | "confused"
  | "celebration";
export type MascotSceneSize = "compact" | "surface" | "modal";

const sources: Record<MascotSceneKind, string> = {
  working:
    "/brand/mascots/creators-mascot-working-laptop-queued-laptop-float.svg",
  running: "/brand/mascots/creators-mascot-running-loader-terrain-loop.svg",
  confused:
    "/brand/mascots/creators-mascot-confused-long-wait-motion-arranged.svg",
  celebration:
    "/brand/mascots/creators-mascot-success-celebration-motion.svg",
};

const sizes: Record<MascotSceneSize, string> = {
  compact: "h-[78px] w-[112px] rounded-xl",
  surface: "h-[124px] w-[196px] rounded-2xl",
  modal: "h-[188px] w-full max-w-[320px] rounded-[22px]",
};

export function MascotScene({
  kind,
  size = "surface",
  className,
}: {
  kind: MascotSceneKind;
  size?: MascotSceneSize;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative shrink-0 overflow-hidden border border-illustration-paper-border bg-illustration-paper shadow-xs",
        sizes[size],
        className,
      )}
    >
      <Image
        src={sources[kind]}
        alt=""
        fill
        unoptimized
        sizes={
          size === "modal" ? "320px" : size === "surface" ? "196px" : "112px"
        }
        className="object-contain p-1.5"
      />
    </div>
  );
}
