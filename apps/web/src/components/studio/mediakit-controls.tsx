/* eslint-disable @next/next/no-img-element -- Authenticated, same-origin asset variants. */
"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { MediaKitArt } from "./mediakit-art";
import {
  assetDetail,
  fitCrop,
  originalUrl,
  positions,
  previewUrl,
  presetCrop,
  resizeCrop,
  type Crop,
  type MediaAsset,
  type Settings,
} from "./mediakit-model";

export const fieldClass =
  "mt-2 w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const choiceClass =
  "min-h-10 rounded-xl border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary";
export function MediaKitDialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    else if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={id}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl border border-border bg-card p-5 text-foreground shadow-xl backdrop:bg-foreground/40 sm:p-6"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id={id} className="font-display text-2xl font-semibold">
          {title}
        </h2>
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <span aria-hidden="true" className="text-xl">
            ×
          </span>
        </Button>
      </div>
      {children}
    </dialog>
  );
}
export function AssetPicker({
  open,
  kind,
  assets,
  selected,
  onSelect,
  onClose,
}: {
  open: boolean;
  kind: string;
  assets: MediaAsset[];
  selected: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const matches = assets.filter(
    (asset) =>
      asset.mediaKind === kind &&
      asset.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <MediaKitDialog
      open={open}
      title={`Choose ${kind.toLowerCase()}`}
      onClose={onClose}
    >
      <label className="block text-sm font-semibold">
        Search recent compatible assets
        <input
          type="search"
          className={fieldClass}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name"
        />
      </label>
      <p className="mt-3 text-xs text-muted-foreground">
        {matches.length} compatible assets · protected previews
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {matches.map((asset) => (
          <button
            key={asset.id}
            type="button"
            onClick={() => {
              onSelect(asset.id);
              onClose();
            }}
            aria-pressed={selected === asset.id}
            className="min-w-0 overflow-hidden rounded-2xl border border-border bg-background text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary"
          >
            <div className="flex aspect-[4/3] items-center justify-center bg-muted">
              {previewUrl(asset, true) ? (
                <img
                  src={previewUrl(asset, true)!}
                  alt=""
                  loading="lazy"
                  className="size-full object-contain"
                />
              ) : (
                <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                  <Icon
                    name={
                      kind === "IMAGE"
                        ? "image"
                        : kind === "VIDEO"
                          ? "video"
                          : "voice"
                    }
                    className="size-8"
                  />
                  Preview pending
                </span>
              )}
            </div>
            <div className="p-3">
              <p className="truncate text-sm font-semibold">{asset.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {assetDetail(asset)}
              </p>
            </div>
          </button>
        ))}
      </div>
      {!matches.length && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No matching assets. Upload media in the Asset Library.
        </p>
      )}
    </MediaKitDialog>
  );
}
export function AssetButton({
  asset,
  label,
  disabled,
  onClick,
}: {
  asset?: MediaAsset;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-border bg-background p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
    >
      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
        {asset && previewUrl(asset, true) ? (
          <img
            src={previewUrl(asset, true)!}
            alt=""
            className="size-full object-contain"
          />
        ) : (
          <Icon name="assets" className="size-5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="block truncate text-sm font-semibold">
          {asset?.name ?? "Choose a workspace asset"}
        </span>
        {asset && (
          <span className="block text-xs text-muted-foreground">
            {assetDetail(asset)}
          </span>
        )}
      </span>
      <Icon name="chevron" className="size-4 shrink-0" />
    </button>
  );
}
export function MediaPreview({
  asset,
  className = "",
  videoRef,
}: {
  asset: MediaAsset;
  className?: string;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}) {
  if (asset.mediaKind === "VIDEO")
    return (
      <video
        key={asset.id}
        ref={videoRef}
        src={originalUrl(asset)}
        poster={previewUrl(asset) ?? undefined}
        controls
        preload="metadata"
        className={`max-h-[460px] w-full ${className}`}
      />
    );
  if (asset.mediaKind === "AUDIO")
    return (
      <div className="space-y-3 p-4">
        {previewUrl(asset) && (
          <img
            src={previewUrl(asset)!}
            alt="Audio waveform"
            className="h-20 w-full object-contain"
          />
        )}
        <audio
          key={asset.id}
          src={originalUrl(asset)}
          controls
          preload="metadata"
          className="w-full"
        />
      </div>
    );
  return previewUrl(asset) ? (
    <img
      key={asset.id}
      src={previewUrl(asset)!}
      alt={asset.name}
      className={`max-h-[460px] w-full object-contain ${className}`}
    />
  ) : (
    <p className="p-8 text-center text-sm text-muted-foreground">
      Image preview is being prepared. The original remains available in your
      Asset Library.
    </p>
  );
}
export function CropCanvas({
  asset,
  crop,
  onChange,
  disabled,
}: {
  asset: MediaAsset;
  crop: Crop;
  onChange: (crop: Crop) => void;
  disabled: boolean;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    crop: Crop;
    corner: string;
  } | null>(null);
  const width = asset.width ?? 1,
    height = asset.height ?? 1;
  return (
    <div
      ref={canvas}
      className="relative mx-auto w-full max-w-xl overflow-hidden bg-muted"
      style={{
        aspectRatio: `${width} / ${height}`,
        maxHeight: 460,
        width: `min(100%, ${(460 * width) / height}px)`,
      }}
    >
      <img
        src={previewUrl(asset)!}
        alt={asset.name}
        className="absolute inset-0 size-full object-fill"
        draggable={false}
      />
      <svg
        className="pointer-events-none absolute inset-0 size-full text-foreground"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          fill="currentColor"
          opacity=".45"
          fillRule="evenodd"
          d={`M0 0H${width}V${height}H0Z M${crop.x} ${crop.y}v${crop.height}h${crop.width}v-${crop.height}Z`}
        />
      </svg>
      <div
        className="absolute border-2 border-primary"
        style={{
          left: `${(crop.x / width) * 100}%`,
          top: `${(crop.y / height) * 100}%`,
          width: `${(crop.width / width) * 100}%`,
          height: `${(crop.height / height) * 100}%`,
        }}
      >
        <span className="pointer-events-none absolute left-1/3 top-0 h-full border-l border-primary/60" />
        <span className="pointer-events-none absolute left-2/3 top-0 h-full border-l border-primary/60" />
        <span className="pointer-events-none absolute left-0 top-1/3 w-full border-t border-primary/60" />
        <span className="pointer-events-none absolute left-0 top-2/3 w-full border-t border-primary/60" />
        {["move", "top_left", "top_right", "bottom_left", "bottom_right"].map(
          (corner) => (
            <button
              key={corner}
              type="button"
              disabled={disabled}
              aria-label={
                corner === "move"
                  ? "Move crop. Use arrow keys; Shift moves ten pixels."
                  : `Resize ${corner.replaceAll("_", " ")} crop corner. Use arrow keys.`
              }
              className={`absolute touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${corner === "move" ? "inset-0 cursor-move" : "z-10 size-10 rounded-full"}`}
              style={
                corner === "move"
                  ? undefined
                  : {
                      left: corner.includes("left") ? 0 : "100%",
                      top: corner.includes("top") ? 0 : "100%",
                      transform: "translate(-50%, -50%)",
                      cursor:
                        corner === "top_left" || corner === "bottom_right"
                          ? "nwse-resize"
                          : "nesw-resize",
                    }
              }
              onPointerDown={(e) => {
                const bounds = canvas.current?.getBoundingClientRect();
                if (!bounds) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { x: e.clientX, y: e.clientY, crop, corner };
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onPointerMove={(e) => {
                const start = drag.current,
                  bounds = canvas.current?.getBoundingClientRect();
                if (!start || !bounds) return;
                const dx = ((e.clientX - start.x) / bounds.width) * width,
                  dy = ((e.clientY - start.y) / bounds.height) * height;
                onChange(
                  start.corner === "move"
                    ? {
                        ...start.crop,
                        x: Math.round(
                          Math.max(
                            0,
                            Math.min(
                              width - start.crop.width,
                              start.crop.x + dx,
                            ),
                          ),
                        ),
                        y: Math.round(
                          Math.max(
                            0,
                            Math.min(
                              height - start.crop.height,
                              start.crop.y + dy,
                            ),
                          ),
                        ),
                      }
                    : resizeCrop(
                        start.crop,
                        start.corner,
                        dx,
                        dy,
                        width,
                        height,
                      ),
                );
              }}
              onKeyDown={(e) => {
                if (
                  !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
                    e.key,
                  )
                )
                  return;
                e.preventDefault();
                const step = e.shiftKey ? 10 : 1,
                  dx =
                    e.key === "ArrowLeft"
                      ? -step
                      : e.key === "ArrowRight"
                        ? step
                        : 0,
                  dy =
                    e.key === "ArrowUp"
                      ? -step
                      : e.key === "ArrowDown"
                        ? step
                        : 0;
                onChange(
                  corner === "move"
                    ? {
                        ...crop,
                        x: Math.max(
                          0,
                          Math.min(width - crop.width, crop.x + dx),
                        ),
                        y: Math.max(
                          0,
                          Math.min(height - crop.height, crop.y + dy),
                        ),
                      }
                    : resizeCrop(crop, corner, dx, dy, width, height),
                );
              }}
            >
              {corner !== "move" && (
                <span className="mx-auto block size-3 rounded-sm border-2 border-primary bg-background" />
              )}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
export function LayoutPreview({
  tool,
  source,
  settings,
  crop,
  logo,
  disabled,
  onCrop,
}: {
  tool: string;
  source?: MediaAsset;
  settings: Settings;
  crop: Crop;
  logo?: MediaAsset;
  disabled: boolean;
  onCrop: (crop: Crop) => void;
}) {
  if (!source)
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-4 bg-muted/40 px-6 py-10 text-center">
        <MediaKitArt tool={tool} className="size-20 text-primary" />
        <div>
          <p className="font-display text-xl font-semibold">
            Your finishing canvas
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose media to see it here.
          </p>
        </div>
      </div>
    );
  if (
    tool === "crop-image" &&
    source.width &&
    source.height &&
    previewUrl(source)
  )
    return (
      <CropCanvas
        asset={source}
        crop={crop}
        onChange={onCrop}
        disabled={disabled}
      />
    );
  const pos = positions.indexOf(settings.position);
  const overlay =
    tool === "add-image-watermark" || tool === "text-to-scrolling-video";
  return (
    <div className="relative overflow-hidden rounded-xl bg-muted/40">
      <MediaPreview asset={source} />
      {overlay && source.mediaKind === "IMAGE" && previewUrl(source) && (
        <div
          className="pointer-events-none absolute inset-0 grid p-4"
          style={{
            gridTemplateColumns: "repeat(3,1fr)",
            gridTemplateRows: "repeat(3,1fr)",
          }}
        >
          {tool === "add-image-watermark" ? (
            <div
              className="min-w-0 self-center"
              style={{
                gridColumn: (pos % 3) + 1,
                gridRow: Math.floor(pos / 3) + 1,
                justifySelf:
                  pos % 3 === 0 ? "start" : pos % 3 === 1 ? "center" : "end",
                opacity: settings.opacity / 100,
                color: settings.color,
                fontSize: `${Math.min(settings.fontSize, 48)}px`,
              }}
            >
              {settings.watermarkType === "image" ? (
                logo && previewUrl(logo) ? (
                  <img
                    src={previewUrl(logo)!}
                    alt="Logo placement guide"
                    className="max-h-16 max-w-24 object-contain"
                  />
                ) : (
                  <span className="text-sm">Choose logo</span>
                )
              ) : (
                <span className="break-words">
                  {settings.text || "Your watermark"}
                </span>
              )}
            </div>
          ) : (
            <div
              className="col-span-3 row-span-3 overflow-hidden break-words p-4 text-center text-xl"
              style={{
                color: settings.color,
                fontFamily:
                  settings.font === "source_han_serif" ? "serif" : "sans-serif",
              }}
            >
              {settings.text || "Your scrolling text"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export function MediaKitControls({
  tool,
  settings: s,
  onChange,
  source,
  crop,
  onCrop,
  logo,
  chooseLogo,
}: {
  tool: string;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  source?: MediaAsset;
  crop: Crop;
  onCrop: (crop: Crop) => void;
  logo?: MediaAsset;
  chooseLogo: () => void;
}) {
  function slider(
    label: string,
    key: "quality" | "pixelSize" | "opacity" | "fontSize",
    min: number,
    max: number,
    unit = "",
  ) {
    return (
      <label className="block text-sm font-semibold">
        {label}
        <span className="float-right tabular-nums text-primary">
          {s[key]}
          {unit}
        </span>
        <input
          type="range"
          min={min}
          max={max}
          value={s[key]}
          onChange={(e) => onChange({ [key]: Number(e.target.value) })}
          className="mt-3 block min-h-10 w-full accent-primary"
        />
      </label>
    );
  }
  if (tool === "compress-image")
    return (
      <>
        {slider("JPEG quality", "quality", 1, 100)}
        <p className="text-xs text-muted-foreground">
          Lower values produce smaller files. Actual size savings appear after
          processing.
        </p>
      </>
    );
  if (tool === "crop-image")
    return (
      <>
        <div className="flex flex-wrap gap-2" aria-label="Crop presets">
          {[
            ["Original", null],
            ["Square", 1],
            ["Portrait", 4 / 5],
            ["Wide", 16 / 9],
          ].map(([name, ratio]) => (
            <button
              type="button"
              className={choiceClass}
              key={String(name)}
              disabled={!source?.width || !source.height}
              onClick={() =>
                onCrop(
                  presetCrop(
                    source!.width!,
                    source!.height!,
                    ratio as number | null,
                  ),
                )
              }
            >
              {name}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Drag the frame or its corners. Arrow keys adjust a focused handle.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {(["x", "y", "width", "height"] as const).map((key) => (
            <label key={key} className="text-sm font-semibold">
              {key === "x"
                ? "Left"
                : key === "y"
                  ? "Top"
                  : key === "width"
                    ? "Width"
                    : "Height"}{" "}
              (px)
              <input
                type="number"
                className={fieldClass}
                min={key === "x" || key === "y" ? 0 : 1}
                max={
                  key === "x" || key === "width"
                    ? (source?.width ?? 10000)
                    : (source?.height ?? 10000)
                }
                value={crop[key]}
                required
                onChange={(e) =>
                  onCrop(
                    fitCrop(
                      { ...crop, [key]: Number(e.target.value) },
                      source?.width ?? 1,
                      source?.height ?? 1,
                    ),
                  )
                }
              />
            </label>
          ))}
        </div>
        {(!source?.width || !source.height) && (
          <p className="text-xs text-warning">
            Choose an image with trusted dimensions to crop.
          </p>
        )}
      </>
    );
  if (tool === "mosaic-image")
    return (
      <>
        {slider("Pixel cell size", "pixelSize", 1, 1000, " px")}
        <p className="text-xs text-muted-foreground">
          Applies pixelation to the whole image.
        </p>
      </>
    );
  if (tool.startsWith("matte-"))
    return (
      <>
        <p className="text-sm font-semibold">Output background</p>
        <div className="flex flex-wrap gap-2">
          {["WEBM", "MP4"].map((value) => (
            <button
              key={value}
              type="button"
              className={choiceClass}
              aria-pressed={s.format === value}
              onClick={() => onChange({ format: value })}
            >
              {value === "WEBM" ? "Transparent WebM" : "Solid MP4"}
            </button>
          ))}
        </div>
        {s.format === "MP4" && (
          <div className="flex flex-wrap gap-2" aria-label="Background color">
            {["green", "black", "white"].map((background) => (
              <button
                type="button"
                key={background}
                aria-pressed={s.background === background}
                className={choiceClass}
                onClick={() => onChange({ background })}
              >
                <svg
                  viewBox="0 0 20 20"
                  className="mr-2 inline size-5"
                  aria-hidden="true"
                >
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill={background}
                    stroke="currentColor"
                  />
                </svg>
                {background.charAt(0).toUpperCase() + background.slice(1)}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Transparency is visible in the finished WebM. The source preview
          remains unchanged.
        </p>
      </>
    );
  if (tool === "add-image-watermark")
    return (
      <>
        <div className="flex gap-2">
          {["text", "image"].map((value) => (
            <button
              key={value}
              type="button"
              className={choiceClass}
              aria-pressed={s.watermarkType === value}
              onClick={() => onChange({ watermarkType: value })}
            >
              {value === "text" ? "Text" : "Logo image"}
            </button>
          ))}
        </div>
        {s.watermarkType === "image" ? (
          <>
            <AssetButton
              asset={logo}
              label="Logo · PNG, JPEG or WebP, up to 5 MiB"
              disabled={false}
              onClick={chooseLogo}
            />
            {slider("Logo opacity", "opacity", 1, 100, "%")}
          </>
        ) : (
          <>
            <label className="block text-sm font-semibold">
              Watermark text
              <input
                required
                maxLength={64}
                className={fieldClass}
                value={s.text}
                placeholder="© Your brand"
                onChange={(e) => onChange({ text: e.target.value })}
              />
            </label>
            {slider("Font size", "fontSize", 8, 200, " px")}
            {slider("Text opacity", "opacity", 1, 100, "%")}
          </>
        )}
        <p className="text-sm font-semibold">Position</p>
        <div className="grid max-w-52 grid-cols-3 gap-2">
          {positions.map((position, index) => (
            <button
              key={position}
              type="button"
              className={choiceClass}
              aria-label={position.replaceAll("_", " ")}
              aria-pressed={s.position === position}
              onClick={() => onChange({ position })}
            >
              <span
                className="block"
                style={{
                  textAlign:
                    index % 3 === 0
                      ? "left"
                      : index % 3 === 1
                        ? "center"
                        : "right",
                }}
              >
                ●
              </span>
            </button>
          ))}
        </div>
        {s.watermarkType === "text" && (
          <label className="block text-sm font-semibold">
            Text color
            <input
              type="color"
              className={`${fieldClass} h-12`}
              value={s.color}
              onChange={(e) => onChange({ color: e.target.value })}
            />
          </label>
        )}
      </>
    );
  if (tool === "text-to-scrolling-video")
    return (
      <>
        <label className="block text-sm font-semibold">
          Scrolling text
          <textarea
            required
            rows={5}
            maxLength={2000}
            className={fieldClass}
            value={s.text}
            onChange={(e) => onChange({ text: e.target.value })}
          />
          <span className="mt-1 block text-right text-xs text-muted-foreground">
            {s.text.length} / 2000
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-semibold">
            Resolution
            <select
              className={fieldClass}
              value={s.resolution}
              onChange={(e) => onChange({ resolution: e.target.value })}
            >
              {["360p", "480p", "720p", "1080p"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Seconds per page
            <input
              required
              type="number"
              min={0.5}
              max={60}
              step={0.5}
              className={fieldClass}
              value={s.seconds}
              onChange={(e) => onChange({ seconds: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm font-semibold">
            Font
            <select
              className={fieldClass}
              value={s.font}
              onChange={(e) => onChange({ font: e.target.value })}
            >
              <option value="inter">Inter</option>
              <option value="roboto">Roboto</option>
              <option value="source_han_serif">Source Han Serif</option>
            </select>
          </label>
          <label className="text-sm font-semibold">
            Text color
            <input
              type="color"
              className={`${fieldClass} h-12`}
              value={s.color}
              onChange={(e) => onChange({ color: e.target.value })}
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Two seconds of still text at the start and end. Provider font wrapping
          determines the final duration.
        </p>
      </>
    );
  if (tool === "enhance-video-smoothness")
    return (
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={s.alignSourceFps}
          onChange={(e) => onChange({ alignSourceFps: e.target.checked })}
          className="size-5 accent-primary"
        />
        Match the source frame rate
      </label>
    );
  return (
    <p className="text-sm leading-6 text-muted-foreground">
      {tool === "face-blur-image"
        ? "Detect and blur faces automatically. Finished output is PNG."
        : tool === "slim-image"
          ? "Apply automatic portrait slimming. Finished output is JPEG."
          : tool === "lip-sync"
            ? "Synchronize the source video to your driving audio. Audio duration determines the output."
            : tool === "assess-video-quality"
              ? "Analyze the source and return the provider’s quality score."
              : "Find semantic boundaries and jump between the returned video segments."}
    </p>
  );
}
