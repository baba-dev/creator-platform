"use client";

import Cropper, { type Area, type Point } from "react-easy-crop";

export type MediaCropArea = Area;
export type MediaCropPoint = Point;
export type QuarterTurn = 0 | 90 | 180 | 270;

export function MediaCropper({
  kind,
  src,
  crop,
  zoom,
  rotation,
  flipX,
  aspect,
  initialCroppedAreaPercentages,
  onCropChange,
  onZoomChange,
  onCropComplete,
}: {
  kind: "image" | "video";
  src: string;
  crop: MediaCropPoint;
  zoom: number;
  rotation: QuarterTurn;
  flipX: boolean;
  aspect: number;
  initialCroppedAreaPercentages?: MediaCropArea;
  onCropChange: (crop: MediaCropPoint) => void;
  onZoomChange: (zoom: number) => void;
  onCropComplete: (area: MediaCropArea, pixels: MediaCropArea) => void;
}) {
  const transform = `translate(${crop.x}px, ${crop.y}px) scaleX(${
    flipX ? -1 : 1
  }) rotate(${rotation}deg) scale(${zoom})`;

  return (
    <div className="relative h-[420px] min-h-64 w-full overflow-hidden rounded-xl bg-surface-sunken">
      <Cropper
        image={kind === "image" ? src : undefined}
        video={kind === "video" ? src : undefined}
        crop={crop}
        zoom={zoom}
        rotation={rotation}
        aspect={aspect}
        transform={transform}
        minZoom={1}
        maxZoom={3}
        zoomSpeed={0.8}
        cropShape="rect"
        objectFit="contain"
        showGrid
        roundCropAreaPixels
        initialCroppedAreaPercentages={initialCroppedAreaPercentages}
        onCropChange={onCropChange}
        onZoomChange={onZoomChange}
        onCropComplete={onCropComplete}
        mediaProps={
          kind === "video"
            ? {
                muted: true,
                loop: true,
                autoPlay: true,
                playsInline: true,
                preload: "metadata",
              }
            : {
                alt: "",
              }
        }
        classes={{
          containerClassName: "bg-surface-sunken",
          cropAreaClassName: "border-primary",
        }}
      />
    </div>
  );
}
