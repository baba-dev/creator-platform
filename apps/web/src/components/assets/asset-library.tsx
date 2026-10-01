"use client";

import Image from "next/image";
import { previewMessage, type PreviewStatus } from "@aiwa/assets/media-status";
import { PreviewStatusPanel } from "./preview-status-panel";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Annotation, Eyebrow } from "@/components/ui/creative";
import { Icon } from "@/components/ui/icon";
import { StatusDot } from "@/components/ui/sketch";

type Project = { id: string; name: string };
type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  _count: { assets: number };
};
type Tag = { id: string; name: string; _count: { assignments: number } };
type Asset = {
  id: string;
  name: string | null;
  originalFilename: string | null;
  mediaKind: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "OTHER";
  sourceType: string;
  mimeType: string;
  byteSize: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  status: string;
  projectId: string | null;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  purgeAfter: string | null;
  project: Project | null;
  folder: { id: string; name: string } | null;
  variants: {
    id: string;
    kind: "THUMBNAIL" | "PREVIEW" | "POSTER" | "STORYBOARD" | "WAVEFORM";
    mimeType: string;
  }[];
  tags: { id: string; name: string }[];
  favorite: boolean;
  previews: PreviewStatus[];
};

function formatBytes(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(bytes >= 10_000_000 ? 0 : 1)} MB`;
}

function kindLabel(kind: Asset["mediaKind"]) {
  return kind === "AUDIO" ? "Audio" : kind[0] + kind.slice(1).toLowerCase();
}

function previewUrl(asset: Asset, inspector = false): string | null {
  if (asset.mediaKind === "IMAGE") {
    if (inspector) {
      return asset.variants.some((variant) => variant.kind === "PREVIEW")
        ? `/api/assets/${asset.id}/variant/preview`
        : null;
    }
    return asset.variants.some((variant) => variant.kind === "THUMBNAIL")
      ? `/api/assets/${asset.id}/variant/thumbnail`
      : null;
  }
  if (
    asset.mediaKind === "VIDEO" &&
    asset.variants.some((v) => v.kind === "POSTER")
  )
    return `/api/assets/${asset.id}/variant/poster`;
  if (
    asset.mediaKind === "AUDIO" &&
    asset.variants.some((v) => v.kind === "WAVEFORM")
  )
    return `/api/assets/${asset.id}/variant/waveform`;
  return null;
}

export function AssetLibrary({
  organizationId,
  canManage,
  projects,
  initialFolders,
  initialTags,
  storageUsedBytes,
  storageQuotaBytes,
}: {
  organizationId: string;
  canManage: boolean;
  projects: Project[];
  initialFolders: Folder[];
  initialTags: Tag[];
  storageUsedBytes: string;
  storageQuotaBytes: string;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [folders, setFolders] = useState(initialFolders);
  const [tags] = useState(initialTags);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [mediaKind, setMediaKind] = useState("");
  const [projectId, setProjectId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [tagId, setTagId] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [trash, setTrash] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inspecting, setInspecting] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showFolderForm, setShowFolderForm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const activeQueryKeyRef = useRef("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  const currentQueryKey = JSON.stringify({
    debouncedQ,
    mediaKind,
    projectId,
    folderId,
    tagId,
    favorite,
    trash,
  });

  const load = useCallback(
    async (cursor?: string) => {
      const append = Boolean(cursor);
      if (append) {
        setLoadingMore(true);
      } else {
        if (activeAbortControllerRef.current) {
          activeAbortControllerRef.current.abort();
        }
        activeAbortControllerRef.current = new AbortController();
        setLoading(true);
        setLoadingMore(false);
        setNextCursor(null);
        activeQueryKeyRef.current = currentQueryKey;
      }

      const seq = ++requestSeqRef.current;
      const controller = activeAbortControllerRef.current;
      setError(null);
      try {
        const params = new URLSearchParams({ organizationId, limit: "60" });
        if (cursor) params.set("cursor", cursor);
        if (debouncedQ) params.set("q", debouncedQ);
        if (mediaKind) params.set("mediaKind", mediaKind);
        if (projectId) params.set("projectId", projectId);
        if (folderId) params.set("folderId", folderId);
        if (tagId) params.set("tagId", tagId);
        if (favorite) params.set("favorite", "true");
        if (trash) params.set("trash", "true");
        const response = await fetch(`/api/assets?${params}`, {
          cache: "no-store",
          signal: append ? undefined : controller?.signal,
        });

        if (seq !== requestSeqRef.current) return;
        if (append && activeQueryKeyRef.current !== currentQueryKey) return;

        const body = (await response.json()) as {
          assets?: Asset[];
          nextCursor?: string | null;
          error?: string;
        };

        if (seq !== requestSeqRef.current) return;
        if (!response.ok || !body.assets)
          throw new Error(body.error ?? "Unable to load asset library.");
        const rows = body.assets;
        setNextCursor(body.nextCursor ?? null);
        if (append) {
          setAssets((current) => {
            const known = new Set(current.map((asset) => asset.id));
            return [
              ...current,
              ...rows.filter((asset) => !known.has(asset.id)),
            ];
          });
        } else {
          setAssets(rows);
          setSelected(new Set());
          setInspecting((current) =>
            current
              ? (rows.find((asset) => asset.id === current.id) ?? null)
              : null,
          );
        }
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") {
          return;
        }
        if (seq === requestSeqRef.current) {
          setError(
            cause instanceof Error ? cause.message : "Unable to load assets.",
          );
        }
      } finally {
        if (seq === requestSeqRef.current) {
          if (append) setLoadingMore(false);
          else setLoading(false);
        }
      }
    },
    [
      organizationId,
      currentQueryKey,
      debouncedQ,
      mediaKind,
      projectId,
      folderId,
      tagId,
      favorite,
      trash,
    ],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
      }
    };
  }, [load]);

  const pollOffset = useRef(0);
  useEffect(() => {
    const pending = assets.filter((asset) =>
      asset.previews?.some((preview) =>
        ["PENDING", "PROCESSING", "RETRY_WAIT"].includes(preview.state),
      ),
    );
    if (!pending.length || trash) return;
    const controller = new AbortController();
    let polling = false;
    const timer = window.setInterval(async () => {
      if (polling) return;
      if (document.visibilityState !== "visible") return;
      const offset = pollOffset.current % pending.length;
      const batch = [
        ...pending.slice(offset),
        ...pending.slice(0, offset),
      ].slice(0, 100);
      pollOffset.current = offset + batch.length;
      const params = new URLSearchParams({ organizationId });
      batch.forEach((asset) => params.append("id", asset.id));
      polling = true;
      try {
        const response = await fetch(`/api/assets/preview-status?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const body = (await response.json()) as {
          assets: Pick<Asset, "id" | "previews" | "variants">[];
        };
        if (controller.signal.aborted) return;
        const updates = new Map(body.assets.map((asset) => [asset.id, asset]));
        setAssets((current) =>
          current.map((asset) => ({ ...asset, ...updates.get(asset.id) })),
        );
        setInspecting((current) =>
          current ? { ...current, ...updates.get(current.id) } : null,
        );
      } catch {
        /* Keep the original usable when status polling is unavailable. */
      } finally {
        polling = false;
      }
    }, 10_000);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [assets, organizationId, trash]);

  const usedPercent = useMemo(() => {
    const used = Number(storageUsedBytes);
    const quota = Number(storageQuotaBytes);
    return quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  }, [storageUsedBytes, storageQuotaBytes]);

  function toggleSelection(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!canManage || !files.length || uploading) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files).slice(0, 10)) {
        const form = new FormData();
        form.set("organizationId", organizationId);
        if (projectId) form.set("projectId", projectId);
        if (folderId && folderId !== "unfiled") form.set("folderId", folderId);
        form.set("file", file);
        const response = await fetch("/api/assets/upload", {
          method: "POST",
          body: form,
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok)
          throw new Error(body.error ?? `Unable to upload ${file.name}.`);
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function bulk(
    action: string,
    extra: Record<string, unknown> = {},
    explicitIds?: string[],
  ) {
    const ids = explicitIds ?? [...selected];
    if (!ids.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/assets/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          assetIds: ids,
          action,
          ...extra,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Bulk operation failed.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Bulk operation failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function patchAsset(asset: Asset, patch: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...patch }),
      });
      const body = (await response.json()) as { asset?: Asset; error?: string };
      if (!response.ok || !body.asset)
        throw new Error(body.error ?? "Unable to update asset.");
      setAssets((rows) =>
        rows.map((row) => (row.id === asset.id ? body.asset! : row)),
      );
      setInspecting(body.asset);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to update asset.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createFolder() {
    if (!newFolderName.trim() || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/assets/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, name: newFolderName }),
      });
      const body = (await response.json()) as {
        folder?: Folder;
        error?: string;
      };
      if (!response.ok || !body.folder)
        throw new Error(body.error ?? "Unable to create folder.");
      setFolders((rows) => [
        ...rows,
        { ...body.folder!, _count: { assets: 0 } },
      ]);
      setNewFolderName("");
      setShowFolderForm(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to create folder.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-reveal">
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Eyebrow>Media workspace</Eyebrow>
          <h1 className="font-display mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
            Asset Library
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Find, organize, preview, reuse and safely retire every generated or
            uploaded media asset.
          </p>
          <Annotation className="mt-2 hidden text-lg text-primary sm:inline-flex">
            your creative shelf, minus the clutter →
          </Annotation>
        </div>
        {canManage ? (
          <div>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only"
              accept="image/png,image/jpeg,image/webp,video/mp4,audio/mpeg,audio/wav,application/pdf"
              onChange={(event) =>
                event.target.files && void uploadFiles(event.target.files)
              }
            />
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              <Icon name="upload" className="size-4" />
              {uploading ? "Uploading…" : "Upload assets"}
            </Button>
          </div>
        ) : null}
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="self-start rounded-[22px] border border-border bg-card/86 p-4 shadow-xs xl:sticky xl:top-24">
          <button
            className={`w-full rounded-xl px-3 py-2 text-left text-sm font-semibold ${!folderId && !favorite && !trash ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            onClick={() => {
              setFolderId("");
              setFavorite(false);
              setTrash(false);
            }}
          >
            All assets
          </button>
          <button
            className={`mt-1 w-full rounded-xl px-3 py-2 text-left text-sm font-semibold ${favorite ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            onClick={() => {
              setFavorite(true);
              setTrash(false);
            }}
          >
            ★ Favourites
          </button>
          <button
            className={`mt-1 w-full rounded-xl px-3 py-2 text-left text-sm font-semibold ${trash ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            onClick={() => {
              setTrash(true);
              setFavorite(false);
            }}
          >
            Trash
          </button>
          <div className="mt-5 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-subtle-foreground">
              Folders
            </p>
            {canManage ? (
              <button
                className="min-h-10 px-2 text-xs font-semibold text-primary"
                onClick={() => setShowFolderForm((v) => !v)}
              >
                + Folder
              </button>
            ) : null}
          </div>
          {showFolderForm ? (
            <div className="mt-2 space-y-2">
              <input
                className="form-control min-h-10 px-3 text-sm"
                value={newFolderName}
                maxLength={80}
                placeholder="Folder name"
                onChange={(event) => setNewFolderName(event.target.value)}
              />
              <Button
                size="sm"
                className="w-full"
                onClick={() => void createFolder()}
                disabled={!newFolderName.trim() || busy}
              >
                Create
              </Button>
            </div>
          ) : null}
          <div className="mt-2 space-y-1">
            <button
              className={`w-full rounded-lg px-3 py-2 text-left text-xs font-medium ${folderId === "unfiled" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"}`}
              onClick={() => setFolderId("unfiled")}
            >
              Unfiled
            </button>
            {folders.map((folder) => (
              <button
                key={folder.id}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium ${folderId === folder.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"}`}
                onClick={() => setFolderId(folder.id)}
              >
                <span className="truncate">{folder.name}</span>
                <span className="tabular-nums text-subtle-foreground">
                  {folder._count.assets}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-6 rounded-xl bg-surface-sunken p-3">
            <div className="flex items-center justify-between text-[10px] text-subtle-foreground">
              <span>Storage</span>
              <span>{usedPercent}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${usedPercent}%` }}
              />
            </div>
            <p className="mt-2 text-[10px] text-subtle-foreground">
              {formatBytes(storageUsedBytes)} used
            </p>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="rounded-[22px] border border-border bg-card/86 p-3 shadow-xs">
            <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Search assets</span>
                <Icon
                  name="search"
                  className="pointer-events-none absolute left-3 top-3 size-4 text-subtle-foreground"
                />
                <input
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  className="form-control min-h-10 pl-10 text-sm"
                  placeholder="Search names, filenames or tags…"
                />
              </label>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <select
                  className="form-control min-h-10 min-w-36 px-3 text-sm"
                  value={mediaKind}
                  onChange={(e) => setMediaKind(e.target.value)}
                >
                  <option value="">All media</option>
                  <option value="IMAGE">Images</option>
                  <option value="VIDEO">Videos</option>
                  <option value="AUDIO">Audio</option>
                  <option value="DOCUMENT">Documents</option>
                </select>
                <select
                  className="form-control min-h-10 min-w-40 px-3 text-sm"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  <option value="">All projects</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <select
                  className="form-control min-h-10 min-w-36 px-3 text-sm"
                  value={tagId}
                  onChange={(e) => setTagId(e.target.value)}
                >
                  <option value="">All tags</option>
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
                <div className="flex rounded-xl border border-border bg-background p-1">
                  <button
                    className={`min-h-8 rounded-lg px-3 text-xs font-semibold ${view === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
                    onClick={() => setView("grid")}
                  >
                    Grid
                  </button>
                  <button
                    className={`min-h-8 rounded-lg px-3 text-xs font-semibold ${view === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
                    onClick={() => setView("list")}
                  >
                    List
                  </button>
                </div>
              </div>
            </div>
          </div>

          {selected.size > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <span className="mr-2 text-xs font-semibold text-foreground">
                {selected.size} selected
              </span>
              {trash ? (
                <Button
                  size="sm"
                  onClick={() => void bulk("restore")}
                  disabled={busy}
                >
                  Restore
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void bulk("trash")}
                  disabled={busy}
                >
                  Move to trash
                </Button>
              )}
              {!trash ? (
                <>
                  <select
                    className="form-control min-h-9 w-auto px-3 text-xs"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value)
                        void bulk("project", {
                          projectId:
                            e.target.value === "none" ? null : e.target.value,
                        });
                      e.currentTarget.value = "";
                    }}
                  >
                    <option value="">Assign project…</option>
                    <option value="none">No project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="form-control min-h-9 w-auto px-3 text-xs"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value)
                        void bulk("folder", {
                          folderId:
                            e.target.value === "none" ? null : e.target.value,
                        });
                      e.currentTarget.value = "";
                    }}
                  >
                    <option value="">Move folder…</option>
                    <option value="none">Unfiled</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      const tagName = window.prompt("Tag selected assets");
                      if (tagName?.trim())
                        void bulk("add-tag", { tagName: tagName.trim() });
                    }}
                  >
                    + Tag
                  </Button>
                </>
              ) : null}
              <button
                className="ml-auto min-h-9 px-2 text-xs font-semibold text-muted-foreground"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </button>
            </div>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-destructive bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <section
            className="mt-4 min-h-80 rounded-[24px] border border-border bg-card/60 p-3 sm:p-4"
            onDragOver={(event) => {
              if (canManage) event.preventDefault();
            }}
            onDrop={(event) => {
              if (!canManage) return;
              event.preventDefault();
              void uploadFiles(event.dataTransfer.files);
            }}
          >
            {loading ? (
              <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">
                Loading your library…
              </div>
            ) : assets.length === 0 ? (
              <div className="grid min-h-72 place-items-center text-center">
                <div>
                  <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Icon name="assets" className="size-6" />
                  </span>
                  <h2 className="font-display mt-4 text-xl font-semibold">
                    {trash ? "Trash is empty" : "No assets match this view"}
                  </h2>
                  <p className="mt-2 max-w-md text-sm text-muted-foreground">
                    {trash
                      ? "Deleted assets stay here for 30 days before permanent cleanup."
                      : canManage
                        ? "Upload media or create something in Studio. Search and filters update instantly."
                        : "Try changing your filters."}
                  </p>
                  {canManage && !trash ? (
                    <Button
                      className="mt-5"
                      onClick={() => inputRef.current?.click()}
                    >
                      Upload your first asset
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : view === "grid" ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {assets.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    selected={selected.has(asset.id)}
                    onSelect={() => toggleSelection(asset.id)}
                    onOpen={() => setInspecting(asset)}
                    onFavorite={() =>
                      void patchAsset(asset, { favorite: !asset.favorite })
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {assets.map((asset) => (
                  <AssetRow
                    key={asset.id}
                    asset={asset}
                    selected={selected.has(asset.id)}
                    onSelect={() => toggleSelection(asset.id)}
                    onOpen={() => setInspecting(asset)}
                  />
                ))}
              </div>
            )}
            {!loading && assets.length > 0 && nextCursor ? (
              <div className="mt-5 flex justify-center border-t border-border pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={loadingMore}
                  onClick={() => void load(nextCursor)}
                >
                  {loadingMore ? "Loading more…" : "Load more assets"}
                </Button>
              </div>
            ) : null}
          </section>
        </div>
      </section>

      {inspecting ? (
        <div
          className="fixed inset-0 z-50 bg-foreground/25 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setInspecting(null);
          }}
        >
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-background shadow-lg">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/92 px-5 py-4 backdrop-blur-xl">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-subtle-foreground">
                  {kindLabel(inspecting.mediaKind)} asset
                </p>
                <h2 className="font-display mt-1 truncate text-xl font-semibold">
                  {inspecting.name ?? "Untitled asset"}
                </h2>
              </div>
              <button
                aria-label="Close asset inspector"
                className="min-h-10 rounded-xl px-3 text-sm font-semibold text-muted-foreground hover:bg-muted"
                onClick={() => setInspecting(null)}
              >
                Close
              </button>
            </div>
            <div className="p-5">
              <AssetPreview
                key={`${inspecting.id}-${inspecting.variants.map((v) => v.id).join("-")}`}
                asset={inspecting}
                inspector
              />
              <PreviewStatusPanel
                assetId={inspecting.id}
                organizationId={organizationId}
                previews={inspecting.previews ?? []}
                canManage={canManage && !trash}
                onRetried={() => void load()}
              />
              <div className="mt-5 grid gap-4">
                <label className="grid gap-2 text-sm font-semibold">
                  Name
                  <input
                    className="form-control"
                    defaultValue={inspecting.name ?? ""}
                    maxLength={191}
                    onBlur={(event) => {
                      if (
                        event.target.value.trim() &&
                        event.target.value !== inspecting.name
                      )
                        void patchAsset(inspecting, {
                          name: event.target.value,
                        });
                    }}
                    disabled={!canManage || busy}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold">
                    Project
                    <select
                      className="form-control"
                      value={inspecting.projectId ?? ""}
                      onChange={(e) =>
                        void patchAsset(inspecting, {
                          projectId: e.target.value || null,
                        })
                      }
                      disabled={!canManage || busy}
                    >
                      <option value="">No project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Folder
                    <select
                      className="form-control"
                      value={inspecting.folderId ?? ""}
                      onChange={(e) =>
                        void patchAsset(inspecting, {
                          folderId: e.target.value || null,
                        })
                      }
                      disabled={!canManage || busy}
                    >
                      <option value="">Unfiled</option>
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div>
                  <p className="text-sm font-semibold">Tags</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {inspecting.tags.map((tag) => (
                      <button
                        key={tag.id}
                        disabled={!canManage || busy}
                        onClick={() =>
                          void patchAsset(inspecting, { removeTagId: tag.id })
                        }
                        className="rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-medium"
                      >
                        {tag.name}
                        {canManage ? " ×" : ""}
                      </button>
                    ))}
                    {canManage ? (
                      <button
                        className="rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-primary"
                        onClick={() => {
                          const name = window.prompt("Add tag");
                          if (name?.trim())
                            void patchAsset(inspecting, {
                              addTag: name.trim(),
                            });
                        }}
                      >
                        + tag
                      </button>
                    ) : null}
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-surface-sunken p-4 text-xs">
                  <div>
                    <dt className="text-subtle-foreground">Source</dt>
                    <dd className="mt-1 font-semibold">
                      {inspecting.sourceType.toLowerCase()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-subtle-foreground">Size</dt>
                    <dd className="mt-1 font-semibold">
                      {formatBytes(inspecting.byteSize)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-subtle-foreground">Dimensions</dt>
                    <dd className="mt-1 font-semibold">
                      {inspecting.width && inspecting.height
                        ? `${inspecting.width} × ${inspecting.height}`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-subtle-foreground">Created</dt>
                    <dd className="mt-1 font-semibold">
                      {new Date(inspecting.createdAt).toLocaleDateString()}
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="secondary">
                    <a href={`/api/assets/${inspecting.id}?download=1`}>
                      Download original
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void patchAsset(inspecting, {
                        favorite: !inspecting.favorite,
                      })
                    }
                  >
                    {inspecting.favorite ? "★ Favourited" : "☆ Add favourite"}
                  </Button>
                  {canManage ? (
                    <Button
                      variant="ghost"
                      className={trash ? "" : "text-destructive"}
                      onClick={async () => {
                        await bulk(trash ? "restore" : "trash", {}, [
                          inspecting.id,
                        ]);
                        setInspecting(null);
                      }}
                    >
                      {trash ? "Restore" : "Move to trash"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function AssetPreview({
  asset,
  inspector = false,
}: {
  asset: Asset;
  inspector?: boolean;
}) {
  const imageUrl = previewUrl(asset, inspector);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const image = failedUrl === imageUrl ? null : imageUrl;
  const primaryKind =
    asset.mediaKind === "IMAGE"
      ? inspector
        ? "PREVIEW"
        : "THUMBNAIL"
      : asset.mediaKind === "VIDEO"
        ? "POSTER"
        : "WAVEFORM";
  const state =
    asset.previews?.find((preview) => preview.kind === primaryKind)?.state ??
    "PENDING";
  const message =
    failedUrl && failedUrl === imageUrl
      ? "Preview unavailable"
      : previewMessage(state);
  if (asset.mediaKind === "VIDEO" && inspector)
    return (
      <div className="space-y-3">
        <video
          className="aspect-video w-full rounded-2xl bg-surface-sunken object-contain"
          controls
          preload="metadata"
          poster={image ?? undefined}
          src={`/api/assets/${asset.id}`}
        />
        {asset.variants.some((variant) => variant.kind === "STORYBOARD") ? (
          <Image
            unoptimized
            src={`/api/assets/${asset.id}/variant/storyboard`}
            alt="Four frames from the video timeline"
            width={1280}
            height={180}
            className="w-full rounded-xl border border-border bg-surface-sunken"
          />
        ) : null}
      </div>
    );
  if (asset.mediaKind === "AUDIO")
    return (
      <div className="space-y-3 rounded-2xl bg-surface-sunken p-3">
        {image ? (
          <Image
            unoptimized
            src={image}
            onError={() => setFailedUrl(image)}
            alt="Audio waveform"
            width={1200}
            height={180}
            className="w-full rounded-lg bg-foreground/90 object-contain"
          />
        ) : (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {message}
          </p>
        )}
        {inspector ? (
          <audio
            className="w-full"
            controls
            preload="metadata"
            src={`/api/assets/${asset.id}`}
          />
        ) : null}
      </div>
    );
  if (image)
    return (
      <Image
        unoptimized
        className={`${inspector ? "max-h-[60vh]" : "aspect-[4/3]"} h-auto w-full rounded-2xl bg-surface-sunken object-contain`}
        onError={() => setFailedUrl(image)}
        alt=""
        loading="lazy"
        src={image}
        width={asset.width ?? 800}
        height={asset.height ?? 600}
      />
    );
  return (
    <div
      className={`${inspector ? "min-h-64" : "aspect-[4/3]"} grid place-items-center rounded-2xl bg-surface-sunken text-muted-foreground`}
    >
      <div className="text-center">
        <Icon
          name={
            asset.mediaKind === "VIDEO"
              ? "video"
              : asset.mediaKind === "IMAGE"
                ? "image"
                : "assets"
          }
          className="mx-auto size-8"
        />
        <p className="mt-2 text-xs font-semibold">
          {asset.previews?.length ? message : kindLabel(asset.mediaKind)}
        </p>
      </div>
    </div>
  );
}

function AssetCard({
  asset,
  selected,
  onSelect,
  onOpen,
  onFavorite,
}: {
  asset: Asset;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onFavorite: () => void;
}) {
  return (
    <article
      className={`group relative overflow-hidden rounded-[20px] border bg-card shadow-xs transition hover:-translate-y-0.5 hover:shadow-sm ${selected ? "border-primary ring-2 ring-primary/15" : "border-border"}`}
    >
      <button
        aria-label={selected ? "Deselect asset" : "Select asset"}
        className="absolute left-3 top-3 z-10 grid size-9 place-items-center rounded-xl border border-border bg-background/90 text-xs font-bold shadow-xs"
        onClick={onSelect}
      >
        {selected ? "✓" : ""}
      </button>
      <button
        aria-label={asset.favorite ? "Remove favourite" : "Add favourite"}
        className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-xl border border-border bg-background/90 text-lg shadow-xs"
        onClick={onFavorite}
      >
        {asset.favorite ? "★" : "☆"}
      </button>
      <button className="block w-full text-left" onClick={onOpen}>
        <div className="p-2">
          <AssetPreview asset={asset} />
        </div>
        <div className="px-4 pb-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">
                {asset.name ?? "Untitled asset"}
              </h3>
              <p className="mt-1 truncate text-[11px] text-subtle-foreground">
                {asset.project?.name ?? asset.folder?.name ?? "Unfiled"}
              </p>
            </div>
            <StatusDot>{kindLabel(asset.mediaKind)}</StatusDot>
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] text-subtle-foreground">
            <span>{formatBytes(asset.byteSize)}</span>
            <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </button>
    </article>
  );
}

function AssetRow({
  asset,
  selected,
  onSelect,
  onOpen,
}: {
  asset: Asset;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-2 py-3 sm:px-3">
      <button
        aria-label={selected ? "Deselect asset" : "Select asset"}
        className={`grid size-9 shrink-0 place-items-center rounded-lg border text-xs font-bold ${selected ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
        onClick={onSelect}
      >
        {selected ? "✓" : ""}
      </button>
      <button
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={onOpen}
      >
        <div className="hidden size-14 shrink-0 sm:block">
          <AssetPreview asset={asset} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {asset.favorite ? "★ " : ""}
            {asset.name ?? "Untitled asset"}
          </p>
          <p className="mt-1 truncate text-xs text-subtle-foreground">
            {kindLabel(asset.mediaKind)} · {formatBytes(asset.byteSize)} ·{" "}
            {asset.project?.name ?? "No project"}
          </p>
        </div>
        <span className="hidden text-xs text-subtle-foreground md:block">
          {new Date(asset.createdAt).toLocaleDateString()}
        </span>
      </button>
    </div>
  );
}
