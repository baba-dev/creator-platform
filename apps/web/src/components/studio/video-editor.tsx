"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_VIDEO_CLIP_TRANSFORM,
  resolveVideoClipTransform,
  videoAspectRatio,
  type VideoClipTransform,
  type VideoEditDocument,
} from "@aiwa/assets/video-edit";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/creative";
import {
  MediaCropper,
  type QuarterTurn,
} from "@/components/studio/media-cropper";
import {
  browserVideoExportBlockReason,
  canUseBrowserVideoRenderer,
} from "@/lib/media-export-policy";

type MediaAsset = {
  id: string;
  name: string | null;
  mediaKind: "VIDEO" | "AUDIO";
  durationMs: number | null;
  width: number | null;
  height: number | null;
  byteSize?: string;
  variants?: { kind: string }[];
};
type EditListItem = { id: string; title: string; revision: number };
const emptyDocument: VideoEditDocument = {
  version: 1,
  ratio: "16:9",
  resolution: "720p",
  clips: [],
  soundtrack: null,
  voiceover: null,
  captions: [],
  burnCaptions: false,
};
const formatTime = (ms: number) => (ms / 1000).toFixed(1) + "s";
const freshTransform = (): VideoClipTransform => ({
  ...DEFAULT_VIDEO_CLIP_TRANSFORM,
  crop: { ...DEFAULT_VIDEO_CLIP_TRANSFORM.crop },
});
const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

export function VideoEditor({
  organizationId,
  initialAssetId,
  canEdit,
}: {
  organizationId: string;
  initialAssetId?: string;
  canEdit: boolean;
}) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [edits, setEdits] = useState<EditListItem[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [title, setTitle] = useState("Untitled video");
  const [document, setDocument] = useState<VideoEditDocument>(() =>
    initialAssetId
      ? {
          ...emptyDocument,
          clips: [
            {
              id: crypto.randomUUID(),
              assetId: initialAssetId,
              inMs: 0,
              outMs: 5000,
              muted: false,
              transition: "cut",
            },
          ],
        }
      : emptyDocument,
  );
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [renderId, setRenderId] = useState<string | null>(null);
  const [renderResult, setRenderResult] = useState<string | null>(null);
  const [framingClipId, setFramingClipId] = useState<string | null>(null);
  const [frameCrop, setFrameCrop] = useState({ x: 0, y: 0 });
  const [frameZoom, setFrameZoom] = useState(1);
  const [clientProgress, setClientProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewState, setReviewState] = useState<{
    renderId: string;
    message: string;
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const clip =
    document.clips.find((item) => item.id === selectedClip) ??
    document.clips[0];
  const source = assets.find((asset) => asset.id === clip?.assetId);
  const clipTransform = clip
    ? resolveVideoClipTransform(clip.transform)
    : freshTransform();
  const browserExportReason = browserVideoExportBlockReason(document, source);
  const duration = useMemo(
    () => document.clips.reduce((sum, item) => sum + item.outMs - item.inMs, 0),
    [document.clips],
  );
  const canSave = canEdit && document.clips.length > 0 && !busy;

  const loadAssets = useCallback(async () => {
    const [videos, audio] = await Promise.all(
      ["VIDEO", "AUDIO"].map(async (mediaKind) => {
        const response = await fetch(
          `/api/assets?organizationId=${encodeURIComponent(organizationId)}&mediaKind=${mediaKind}&limit=100`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("Media library unavailable.");
        return (await response.json()) as { assets: MediaAsset[] };
      }),
    );
    setAssets([...(videos?.assets ?? []), ...(audio?.assets ?? [])]);
  }, [organizationId]);
  useEffect(() => {
    void Promise.resolve()
      .then(loadAssets)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Media unavailable.");
      });
    void fetch(
      `/api/video-edits?organizationId=${encodeURIComponent(organizationId)}`,
      { cache: "no-store" },
    )
      .then((response) => response.json())
      .then((data: { edits?: EditListItem[] }) => setEdits(data.edits ?? []))
      .catch(() => undefined);
  }, [organizationId, loadAssets]);
  useEffect(() => {
    if (!renderId) return;
    let active = true;
    const check = async () => {
      try {
        const response = await fetch(
          `/api/video-renders/${renderId}?organizationId=${encodeURIComponent(organizationId)}`,
          { cache: "no-store" },
        );
        const data = (await response.json()) as {
          status?: string;
          processingState?: string;
          outputAssetId?: string;
          errorMessage?: string;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? "Render unavailable.");
        if (!active) return;
        if (data.status === "SUCCEEDED" && data.outputAssetId) {
          setRenderResult(data.outputAssetId);
          setRenderId(null);
          setBusy(false);
          setMessage("Your video is ready.");
          void loadAssets().catch(() => undefined);
        } else if (data.processingState === "REVIEW") {
          setRenderId(null);
          setBusy(false);
          setReviewState({
            renderId,
            message:
              "Your source media is safe. This export is paused pending support review before retrying.",
          });
          setMessage(null);
          setError(null);
        } else if (
          data.status === "FAILED" ||
          data.processingState === "FAILED"
        ) {
          setRenderId(null);
          setBusy(false);
          setError(data.errorMessage ?? "Render failed.");
        }
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Render status unavailable.",
          );
      }
    };
    void check();
    const timer = setInterval(() => void check(), 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [organizationId, renderId, loadAssets]);
  function updateClip(
    id: string,
    patch: Partial<VideoEditDocument["clips"][number]>,
  ) {
    setDocument((current) => ({
      ...current,
      clips: current.clips.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  }
  function updateClipTransform(
    id: string,
    patch: Partial<VideoClipTransform>,
  ) {
    const currentClip = document.clips.find((item) => item.id === id);
    const current = resolveVideoClipTransform(currentClip?.transform);
    updateClip(id, {
      transform: {
        ...current,
        ...patch,
        crop: patch.crop ? { ...patch.crop } : { ...current.crop },
      },
    });
  }
  function resetClipFraming(id: string) {
    updateClip(id, { transform: freshTransform() });
    setFrameCrop({ x: 0, y: 0 });
    setFrameZoom(1);
  }
  function addClip(assetId: string) {
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) return;
    const id = crypto.randomUUID();
    setDocument((current) => ({
      ...current,
      clips: [
        ...current.clips,
        {
          id,
          assetId,
          inMs: 0,
          outMs: asset.durationMs ?? 5000,
          muted: false,
          transition: "cut",
          transform: freshTransform(),
        },
      ],
    }));
    setSelectedClip(id);
  }
  function splitClip() {
    if (!clip) return;
    const atPlayhead = Math.round((videoRef.current?.currentTime ?? 0) * 1000);
    const splitAt =
      atPlayhead > clip.inMs && atPlayhead < clip.outMs
        ? atPlayhead
        : Math.round((clip.inMs + clip.outMs) / 2);
    if (splitAt <= clip.inMs || splitAt >= clip.outMs) return;
    const second = {
      ...clip,
      id: crypto.randomUUID(),
      inMs: splitAt,
      transition: "cut" as const,
    };
    setDocument((current) => {
      const index = current.clips.findIndex((item) => item.id === clip.id);
      return {
        ...current,
        clips: current.clips.flatMap((item, i) =>
          i === index ? [{ ...item, outMs: splitAt }, second] : [item],
        ),
      };
    });
    setSelectedClip(second.id);
  }
  function startAiWorkflow(workflow: "EDIT" | "EXTEND") {
    if (!clip?.assetId) {
      setError("Select a video clip before starting an AI action.");
      return;
    }
    window.dispatchEvent(
      new CustomEvent("creators:video-workflow", {
        detail: { workflow, assetId: clip.assetId },
      }),
    );
  }

  async function save() {
    if (!canSave) return null;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        editId ? `/api/video-edits/${editId}` : "/api/video-edits",
        {
          method: editId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            title,
            document,
            ...(editId ? { revision } : {}),
          }),
        },
      );
      const data = (await response.json()) as {
        edit?: { id: string; revision: number };
        revision?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Could not save edit.");
      const id = data.edit?.id ?? editId!;
      const nextRevision = data.edit?.revision ?? data.revision!;
      setEditId(id);
      setRevision(nextRevision);
      setMessage("Draft saved.");
      setEdits((current) => [
        { id, title, revision: nextRevision },
        ...current.filter((item) => item.id !== id),
      ]);
      return { id, revision: nextRevision };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save edit.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function queueServerRender(saved: {
    id: string;
    revision: number;
  }) {
    setBusy(true);
    setClientProgress(null);
    setError(null);
    setReviewState(null);
    setMessage("Compatibility render queued. You can leave this page after it starts.");
    try {
      const response = await fetch(`/api/video-edits/${saved.id}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          revision: saved.revision,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = (await response.json()) as {
        renderId?: string;
        error?: string;
      };
      if (!response.ok || !data.renderId)
        throw new Error(data.error ?? "Could not start render.");
      setRenderId(data.renderId);
    } catch (cause) {
      setBusy(false);
      setError(
        cause instanceof Error ? cause.message : "Could not start render.",
      );
    }
  }

  async function render() {
    const saved = await save();
    if (!saved) return;
    setBusy(true);
    setError(null);
    setReviewState(null);
    setRenderResult(null);

    const simpleSource =
      document.clips.length === 1
        ? assets.find((asset) => asset.id === document.clips[0]?.assetId)
        : undefined;
    const blockReason = browserVideoExportBlockReason(document, simpleSource);
    if (!blockReason && simpleSource && canUseBrowserVideoRenderer()) {
      setClientProgress(0);
      setMessage("Rendering on this device to keep server load low…");
      try {
        const sourceResponse = await fetch(
          `/api/assets/${encodeURIComponent(simpleSource.id)}`,
          { cache: "no-store" },
        );
        if (!sourceResponse.ok)
          throw new Error("Source video could not be loaded for device rendering.");
        const sourceBlob = await sourceResponse.blob();
        const { renderSimpleVideoInBrowser } = await import(
          "@/lib/browser-video-renderer"
        );
        const output = await renderSimpleVideoInBrowser({
          source: sourceBlob,
          document,
          onProgress: setClientProgress,
        });
        const safeTitle =
          title
            .trim()
            .replace(/[^a-zA-Z0-9._-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 120) || "edited-video";
        const uploadResponse = await fetch("/api/assets/media-upload", {
          method: "POST",
          headers: {
            "x-organization-id": organizationId,
            "x-file-name": `${safeTitle}-edited.mp4`,
            "Content-Type": "video/mp4",
          },
          body: output,
        });
        const uploadData = (await uploadResponse.json()) as {
          asset?: MediaAsset;
          error?: string;
        };
        if (!uploadResponse.ok || !uploadData.asset)
          throw new Error(uploadData.error ?? "Rendered video could not be saved.");
        setRenderResult(uploadData.asset.id);
        setClientProgress(null);
        setBusy(false);
        setMessage("Video ready — rendered on this device. The original is unchanged.");
        await loadAssets().catch(() => undefined);
        return;
      } catch {
        setClientProgress(null);
        setMessage(
          "Device render is unavailable for this media. Switching to the compatibility renderer…",
        );
      }
    } else {
      setMessage(
        blockReason
          ? `Using the compatibility renderer: ${blockReason}.`
          : "This browser does not expose the required media codecs. Using the compatibility renderer…",
      );
    }

    await queueServerRender(saved);
  }
  async function loadEdit(id: string) {
    if (!id) {
      setEditId(null);
      setRevision(null);
      setDocument(emptyDocument);
      setTitle("Untitled video");
      return;
    }
    try {
      const response = await fetch(
        `/api/video-edits/${id}?organizationId=${encodeURIComponent(organizationId)}`,
      );
      const data = (await response.json()) as {
        edit?: {
          id: string;
          title: string;
          revision: number;
          document: VideoEditDocument;
        };
        error?: string;
      };
      if (!response.ok || !data.edit)
        throw new Error(data.error ?? "Could not load edit.");
      setEditId(data.edit.id);
      setRevision(data.edit.revision);
      setTitle(data.edit.title);
      setDocument(data.edit.document);
      setSelectedClip(data.edit.document.clips[0]?.id ?? null);
      setFramingClipId(null);
      setFrameCrop({ x: 0, y: 0 });
      setFrameZoom(1);
      setRenderResult(null);
      setMessage(null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load edit.");
    }
  }
  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/assets/media-upload", {
        method: "POST",
        headers: {
          "x-organization-id": organizationId,
          "x-file-name": file.name,
        },
        body: file,
      });
      const data = (await response.json()) as {
        asset?: MediaAsset;
        error?: string;
      };
      if (!response.ok || !data.asset)
        throw new Error(data.error ?? "Upload failed.");
      await loadAssets();
      if (data.asset.mediaKind === "VIDEO") {
        const id = crypto.randomUUID();
        setDocument((current) => ({
          ...current,
          clips: [
            ...current.clips,
            {
              id,
              assetId: data.asset!.id,
              inMs: 0,
              outMs: data.asset!.durationMs ?? 5000,
              muted: false,
              transition: "cut",
            },
          ],
        }));
        setSelectedClip(id);
      }
      setMessage("Uploaded to your library.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  async function importLink() {
    if (!canEdit || !link.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/assets/video-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, url: link.trim() }),
      });
      const data = (await response.json()) as {
        asset?: MediaAsset;
        error?: string;
      };
      if (!response.ok || !data.asset)
        throw new Error(data.error ?? "Video import failed.");
      await loadAssets();
      const id = crypto.randomUUID();
      setDocument((current) => ({
        ...current,
        clips: [
          ...current.clips,
          {
            id,
            assetId: data.asset!.id,
            inMs: 0,
            outMs: data.asset!.durationMs ?? 5000,
            muted: false,
            transition: "cut",
          },
        ],
      }));
      setSelectedClip(id);
      setLink("");
      setMessage("Approved video imported privately.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Video import failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      id="video-editor"
      className="paper-sheet relative rounded-[28px] border border-border p-5 sm:p-7"
      aria-label="Video editor"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Video editing desk</Eyebrow>
          <h2 className="font-display mt-2 text-2xl font-semibold">
            Shape the final cut.
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Arrange clips, add narration or music, and save a new video.
            Originals stay intact. AI Edit and Extend hand the selected source
            to the Seedance workflow above for a separately quoted generation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void save()}
            disabled={!canSave}
          >
            Save draft
          </Button>
          <Button
            type="button"
            onClick={() => void render()}
            disabled={!canSave}
          >
            {clientProgress !== null
              ? `Exporting ${Math.round(clientProgress * 100)}%`
              : busy
                ? "Exporting…"
                : "Export MP4"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => startAiWorkflow("EDIT")}
            disabled={!clip || busy}
          >
            AI Edit
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => startAiWorkflow("EXTEND")}
            disabled={!clip || busy}
          >
            Extend with AI
          </Button>
        </div>
      </div>
      <div className="mt-6 grid min-w-0 gap-5 xl:grid-cols-[minmax(230px,0.7fr)_minmax(0,1.5fr)_minmax(260px,0.8fr)]">
        <aside
          className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-4"
          aria-label="Media and drafts"
        >
          <label className="grid gap-2 text-xs font-semibold">
            Saved drafts
            <select
              value={editId ?? ""}
              onChange={(event) => void loadEdit(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3"
            >
              <option value="">New video</option>
              {edits.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-xs font-semibold">
            Video title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={191}
              className="min-h-11 rounded-xl border border-input bg-background px-3"
            />
          </label>
          <label className="grid gap-2 text-xs font-semibold">
            Upload video or audio
            <input
              type="file"
              accept="video/mp4,audio/mpeg,audio/wav"
              disabled={!canEdit || busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void upload(file);
                event.currentTarget.value = "";
              }}
              className="min-w-0 text-xs"
            />
          </label>
          <div className="space-y-2">
            <label className="grid gap-2 text-xs font-semibold">
              Approved MP4 link
              <input
                type="url"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="https://approved-host.example/clip.mp4"
                maxLength={2048}
                className="min-h-11 min-w-0 rounded-xl border border-input bg-background px-3"
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              disabled={!canEdit || busy || !link.trim()}
              onClick={() => void importLink()}
            >
              Import link
            </Button>
          </div>
          <label className="grid gap-2 text-xs font-semibold">
            Add a video
            <select
              value=""
              disabled={!canEdit}
              onChange={(event) => addClip(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3"
            >
              <option value="">Choose a library video…</option>
              {assets
                .filter((item) => item.mediaKind === "VIDEO")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name ?? "Video"}
                  </option>
                ))}
            </select>
          </label>
        </aside>
        <div className="min-w-0 space-y-4">
          <div className="grid min-h-64 place-items-center overflow-hidden rounded-2xl border border-border bg-surface-sunken p-3">
            {clip && framingClipId === clip.id ? (
              <MediaCropper
                key={`${clip.id}:${clipTransform.rotation}:${document.ratio}`}
                kind="video"
                src={`/api/assets/${clip.assetId}`}
                crop={frameCrop}
                zoom={frameZoom}
                rotation={clipTransform.rotation}
                flipX={clipTransform.flipX}
                aspect={videoAspectRatio(document.ratio)}
                initialCroppedAreaPercentages={{
                  x: clipTransform.crop.x * 100,
                  y: clipTransform.crop.y * 100,
                  width: clipTransform.crop.width * 100,
                  height: clipTransform.crop.height * 100,
                }}
                onCropChange={setFrameCrop}
                onZoomChange={setFrameZoom}
                onCropComplete={(area) => {
                  const x = clampUnit(area.x / 100);
                  const y = clampUnit(area.y / 100);
                  const width = Math.min(
                    clampUnit(area.width / 100),
                    1 - x,
                  );
                  const height = Math.min(
                    clampUnit(area.height / 100),
                    1 - y,
                  );
                  updateClipTransform(clip.id, {
                    crop: {
                      x,
                      y,
                      width: Math.max(0.000001, width),
                      height: Math.max(0.000001, height),
                    },
                  });
                }}
              />
            ) : clip ? (
              <video
                key={clip.id}
                ref={videoRef}
                src={`/api/assets/${clip.assetId}`}
                controls
                playsInline
                preload="metadata"
                onLoadedMetadata={(event) => {
                  const real = Math.floor(event.currentTarget.duration * 1000);
                  if (Number.isFinite(real) && real > 0 && clip.outMs > real)
                    updateClip(clip.id, { outMs: real });
                }}
                style={{
                  transform: `scaleX(${clipTransform.flipX ? -1 : 1}) rotate(${clipTransform.rotation}deg)`,
                }}
                className="max-h-[440px] w-full rounded-xl object-contain"
                aria-label={source?.name ?? "Selected video clip"}
              />
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                Add a video from your library to start editing.
              </p>
            )}
          </div>
          {source?.variants?.some(
            (variant) => variant.kind === "STORYBOARD",
          ) ? (
            <Image
              unoptimized
              src={`/api/assets/${source.id}/variant/storyboard`}
              alt="Four evenly spaced frames from the selected clip"
              width={1280}
              height={180}
              className="w-full rounded-xl border border-border bg-surface-sunken"
            />
          ) : null}
          <div className="min-w-0 rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-display text-lg font-semibold">Timeline</h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatTime(duration)} · {document.clips.length} clips
              </span>
            </div>
            <div
              className="flex min-h-24 min-w-0 gap-2 overflow-x-auto pb-2"
              role="list"
              aria-label="Video clips"
            >
              {document.clips.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  role="listitem"
                  onClick={() => setSelectedClip(item.id)}
                  className={`relative min-w-36 flex-1 overflow-hidden rounded-xl border text-left focus-visible:outline-2 focus-visible:outline-primary ${clip?.id === item.id ? "border-primary bg-primary/10" : "border-border bg-surface-sunken"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/assets/${item.assetId}/variant/POSTER`}
                    alt=""
                    className="h-16 w-full object-cover"
                  />
                  <span className="block truncate px-2 py-1 text-xs font-semibold">
                    {index + 1}.{" "}
                    {assets.find((asset) => asset.id === item.assetId)?.name ??
                      "Video"}{" "}
                    · {formatTime(item.outMs - item.inMs)}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Select a clip to set its in and out points. Split creates two
              editable sections; the exported cut follows this order.
            </p>
          </div>
          {renderResult ? (
            <div
              role="status"
              className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm"
            >
              Video ready.{" "}
              <a
                className="font-semibold text-primary underline"
                href={`/api/assets/${renderResult}?download=1`}
              >
                Download MP4
              </a>
            </div>
          ) : null}
          {reviewState ? (
            <div
              role="status"
              className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm space-y-2"
            >
              <div className="font-semibold text-warning-foreground">
                Export Under Review
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {reviewState.message}
              </p>
              <div className="flex items-center gap-3 pt-1">
                <a
                  className="font-semibold text-primary underline text-xs"
                  href={`mailto:support@aiwa.dev?subject=${encodeURIComponent(`Video Export Review - Render ${reviewState.renderId}`)}`}
                >
                  Contact Support
                </a>
                <button
                  type="button"
                  onClick={() => setReviewState(null)}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}
          {message ? (
            <p role="status" className="text-sm text-primary">
              {message}
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-destructive p-3 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>
        <aside
          className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-4"
          aria-label="Video settings"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-lg font-semibold">Edit settings</h3>
            <span className="rounded-full border border-border bg-surface-sunken px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {browserExportReason ? "Hybrid export" : "Device-first export"}
            </span>
          </div>
          {clip ? (
            <div className="space-y-3 border-b border-border pb-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Selected clip
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(["inMs", "outMs"] as const).map((key) => (
                  <label key={key} className="grid gap-1 text-xs font-semibold">
                    {key === "inMs" ? "In (s)" : "Out (s)"}
                    <input
                      type="number"
                      min="0"
                      max="120"
                      step="0.1"
                      value={clip[key] / 1000}
                      onChange={(event) =>
                        updateClip(clip.id, {
                          [key]: Math.round(Number(event.target.value) * 1000),
                        })
                      }
                      className="min-h-10 min-w-0 rounded-lg border border-input bg-background px-2"
                    />
                  </label>
                ))}
              </div>
              <div className="rounded-xl border border-border bg-surface-sunken p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold">Frame & transform</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      Crop, zoom, rotate and flip without changing the source.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (framingClipId === clip.id) {
                        setFramingClipId(null);
                      } else {
                        setFramingClipId(clip.id);
                        setFrameCrop({ x: 0, y: 0 });
                        setFrameZoom(1);
                      }
                    }}
                    className="min-h-10 rounded-lg border border-border bg-background px-3 text-xs font-semibold"
                  >
                    {framingClipId === clip.id ? "Done framing" : "Frame visually"}
                  </button>
                </div>
                {framingClipId === clip.id ? (
                  <label className="mt-3 grid gap-1 text-xs font-semibold">
                    Zoom · {frameZoom.toFixed(2)}×
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.01}
                      value={frameZoom}
                      onChange={(event) =>
                        setFrameZoom(Number(event.target.value))
                      }
                      className="min-h-10 accent-current"
                    />
                  </label>
                ) : null}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const rotation = ((clipTransform.rotation + 270) %
                        360) as QuarterTurn;
                      updateClipTransform(clip.id, {
                        rotation,
                        crop: { ...DEFAULT_VIDEO_CLIP_TRANSFORM.crop },
                      });
                      setFrameCrop({ x: 0, y: 0 });
                      setFrameZoom(1);
                    }}
                    className="min-h-10 rounded-lg border border-border bg-background px-2 text-xs font-semibold"
                  >
                    Rotate left
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const rotation = ((clipTransform.rotation + 90) %
                        360) as QuarterTurn;
                      updateClipTransform(clip.id, {
                        rotation,
                        crop: { ...DEFAULT_VIDEO_CLIP_TRANSFORM.crop },
                      });
                      setFrameCrop({ x: 0, y: 0 });
                      setFrameZoom(1);
                    }}
                    className="min-h-10 rounded-lg border border-border bg-background px-2 text-xs font-semibold"
                  >
                    Rotate right
                  </button>
                  <button
                    type="button"
                    aria-pressed={clipTransform.flipX}
                    onClick={() =>
                      updateClipTransform(clip.id, {
                        flipX: !clipTransform.flipX,
                      })
                    }
                    className="min-h-10 rounded-lg border border-border bg-background px-2 text-xs font-semibold"
                  >
                    {clipTransform.flipX ? "Unflip" : "Flip horizontal"}
                  </button>
                  <button
                    type="button"
                    onClick={() => resetClipFraming(clip.id)}
                    className="min-h-10 rounded-lg border border-border bg-background px-2 text-xs font-semibold"
                  >
                    Reset framing
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={clip.muted}
                  onChange={(event) =>
                    updateClip(clip.id, { muted: event.target.checked })
                  }
                />
                Mute original audio
              </label>
              <label className="grid gap-1 text-xs font-semibold">
                Entrance
                <select
                  value={clip.transition}
                  onChange={(event) =>
                    updateClip(clip.id, {
                      transition: event.target.value as "cut" | "fade",
                    })
                  }
                  className="min-h-10 rounded-lg border border-input bg-background px-2"
                >
                  <option value="cut">Cut</option>
                  <option value="fade">Fade in</option>
                </select>
              </label>
              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={splitClip}
                  className="rounded-lg border border-border px-3 py-2"
                >
                  Split at playhead
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDocument((current) => {
                      const index = current.clips.findIndex(
                        (item) => item.id === clip.id,
                      );
                      if (index < 1) return current;
                      const clips = [...current.clips];
                      [clips[index - 1], clips[index]] = [
                        clips[index]!,
                        clips[index - 1]!,
                      ];
                      return { ...current, clips };
                    })
                  }
                  className="rounded-lg border border-border px-3 py-2"
                >
                  Move left
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDocument((current) => ({
                      ...current,
                      clips: current.clips.filter(
                        (item) => item.id !== clip.id,
                      ),
                    }))
                  }
                  className="rounded-lg border border-destructive/30 px-3 py-2 text-destructive"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            {(["ratio", "resolution"] as const).map((key) => (
              <label
                key={key}
                className="grid gap-1 text-xs font-semibold capitalize"
              >
                {key}
                <select
                  value={document[key]}
                  onChange={(event) =>
                    setDocument((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                  className="min-h-10 min-w-0 rounded-lg border border-input bg-background px-2"
                >
                  {(key === "ratio"
                    ? ["16:9", "9:16", "1:1", "4:3", "3:4"]
                    : ["720p", "1080p"]
                  ).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {(["voiceover", "soundtrack"] as const).map((key) => (
            <div key={key} className="space-y-2 border-t border-border pt-3">
              <label className="grid gap-1 text-xs font-semibold capitalize">
                {key === "voiceover"
                  ? "Narration / Speech asset"
                  : "Music / soundtrack"}
                <select
                  value={document[key]?.assetId ?? ""}
                  onChange={(event) => {
                    const asset = assets.find(
                      (item) => item.id === event.target.value,
                    );
                    setDocument((current) => ({
                      ...current,
                      [key]: asset
                        ? {
                            assetId: asset.id,
                            startMs: 0,
                            inMs: 0,
                            outMs: Math.min(
                              duration,
                              asset.durationMs ?? duration,
                            ),
                            volume: key === "soundtrack" ? 0.3 : 1,
                            fadeInMs: 0,
                            fadeOutMs: 0,
                          }
                        : null,
                    }));
                  }}
                  className="min-h-10 w-full rounded-lg border border-input bg-background px-2"
                >
                  <option value="">None</option>
                  {assets
                    .filter((item) => item.mediaKind === "AUDIO")
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name ?? "Audio"}
                      </option>
                    ))}
                </select>
              </label>
              {document[key] ? (
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-xs">
                    Volume
                    <input
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={document[key].volume}
                      onChange={(event) =>
                        setDocument((current) => ({
                          ...current,
                          [key]: {
                            ...current[key]!,
                            volume: Number(event.target.value),
                          },
                        }))
                      }
                      className="min-h-10 min-w-0 rounded-lg border border-input bg-background px-2"
                    />
                  </label>
                  <label className="grid gap-1 text-xs">
                    Start (s)
                    <input
                      type="number"
                      min="0"
                      max="120"
                      step="0.1"
                      value={document[key].startMs / 1000}
                      onChange={(event) =>
                        setDocument((current) => ({
                          ...current,
                          [key]: {
                            ...current[key]!,
                            startMs: Math.round(
                              Number(event.target.value) * 1000,
                            ),
                          },
                        }))
                      }
                      className="min-h-10 min-w-0 rounded-lg border border-input bg-background px-2"
                    />
                  </label>
                </div>
              ) : null}
            </div>
          ))}
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold">Captions</p>
              <button
                type="button"
                onClick={() =>
                  setDocument((current) => ({
                    ...current,
                    captions: [
                      ...current.captions,
                      {
                        id: crypto.randomUUID(),
                        startMs: 0,
                        endMs: Math.min(duration, 2000),
                        text: "",
                        language: "en",
                      },
                    ],
                  }))
                }
                disabled={!duration}
                className="text-xs font-semibold text-primary"
              >
                Add line
              </button>
            </div>
            {document.captions.map((item) => (
              <div
                key={item.id}
                className="space-y-2 rounded-lg border border-border p-2"
              >
                <input
                  aria-label="Caption text"
                  placeholder="Caption text"
                  value={item.text}
                  onChange={(event) =>
                    setDocument((current) => ({
                      ...current,
                      captions: current.captions.map((row) =>
                        row.id === item.id
                          ? { ...row, text: event.target.value }
                          : row,
                      ),
                    }))
                  }
                  className="min-h-9 w-full rounded-lg border border-input bg-background px-2 text-xs"
                />
                <div className="grid grid-cols-3 gap-1">
                  {(["startMs", "endMs"] as const).map((key) => (
                    <input
                      key={key}
                      type="number"
                      aria-label={
                        key === "startMs"
                          ? "Caption start seconds"
                          : "Caption end seconds"
                      }
                      min="0"
                      step="0.1"
                      value={item[key] / 1000}
                      onChange={(event) =>
                        setDocument((current) => ({
                          ...current,
                          captions: current.captions.map((row) =>
                            row.id === item.id
                              ? {
                                  ...row,
                                  [key]: Math.round(
                                    Number(event.target.value) * 1000,
                                  ),
                                }
                              : row,
                          ),
                        }))
                      }
                      className="min-h-9 min-w-0 rounded-lg border border-input bg-background px-1 text-xs"
                    />
                  ))}
                  <select
                    aria-label="Caption language"
                    value={item.language}
                    onChange={(event) =>
                      setDocument((current) => ({
                        ...current,
                        captions: current.captions.map((row) =>
                          row.id === item.id
                            ? {
                                ...row,
                                language: event.target.value as
                                  "en" | "ar" | "hi" | "ur",
                              }
                            : row,
                        ),
                      }))
                    }
                    className="min-w-0 rounded-lg border border-input bg-background text-xs"
                  >
                    {["en", "ar", "hi", "ur"].map((language) => (
                      <option key={language}>{language}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDocument((current) => ({
                      ...current,
                      captions: current.captions.filter(
                        (row) => row.id !== item.id,
                      ),
                    }))
                  }
                  className="text-xs text-destructive"
                >
                  Remove caption
                </button>
              </div>
            ))}
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={document.burnCaptions}
                onChange={(event) =>
                  setDocument((current) => ({
                    ...current,
                    burnCaptions: event.target.checked,
                  }))
                }
              />
              Burn captions into video
            </label>
            {editId && document.captions.length > 0 ? (
              <div className="flex flex-wrap gap-3 text-xs">
                {(["srt", "vtt"] as const).map((format) => (
                  <a
                    key={format}
                    href={`/api/video-edits/${encodeURIComponent(editId)}/captions?organizationId=${encodeURIComponent(organizationId)}&format=${format}`}
                    className="font-semibold text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Download saved {format.toUpperCase()}
                  </a>
                ))}
                <p className="w-full text-muted-foreground">
                  Save changes before downloading subtitles.
                </p>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
