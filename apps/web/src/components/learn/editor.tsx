"use client";
/* eslint-disable @next/next/no-img-element -- bounded editorial media */
import { useEditor, EditorContent } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  emptyContent,
  learnTopics,
  learnTypes,
  learnTools,
  mediaUrl,
  type LearnContent,
} from "@aiwa/learn/content";
import { Button } from "@/components/ui/button";
import "./learn.css";
type Media = {
  id: string;
  alt: string;
  caption: string;
  credit: string;
  asset: {
    mediaKind: string;
    width: number | null;
    height: number | null;
    name: string;
  };
};
type Revision = { id: string; content: LearnContent; createdAt: string };
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const MediaEmbed = Node.create({
  name: "mediaEmbed",
  group: "block",
  atom: true,
  addAttributes() {
    return { src: { default: null }, kind: { default: "video" } };
  },
  parseHTML() {
    return [
      { tag: "video", getAttrs: () => ({ kind: "video" }) },
      { tag: "audio", getAttrs: () => ({ kind: "audio" }) },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const { kind, ...attrs } = HTMLAttributes;
    return [
      kind === "audio" ? "audio" : "video",
      mergeAttributes(attrs, { controls: "", preload: "metadata" }),
    ];
  },
});
export function LearnEditor({
  initial,
  id: initialId,
  version: initialVersion = 1,
  reviewDate = "",
}: {
  initial: LearnContent;
  id?: string;
  version?: number;
  reviewDate?: string;
}) {
  const [content, setContent] = useState(initial);
  const contentRef = useRef(initial);
  const [id, setId] = useState(initialId);
  const idRef = useRef(initialId);
  const version = useRef(initialVersion);
  const [message, setMessage] = useState("All changes saved.");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const dirty = useRef(false);
  const conflicted = useRef(false);
  const [media, setMedia] = useState<Media[]>([]);
  const [showMedia, setShowMedia] = useState(false);
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [credit, setCredit] = useState("");
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [reviewAt, setReviewAt] = useState(reviewDate);
  const [linkUrl, setLinkUrl] = useState("");
  const [showLink, setShowLink] = useState(false);
  const update = useCallback((patch: Partial<LearnContent>) => {
    const next = { ...contentRef.current, ...patch };
    contentRef.current = next;
    setContent(next);
    dirty.current = true;
    setMessage("Unsaved changes");
  }, []);
  const editor = useEditor({
    extensions: [
      StarterKit,
      MediaEmbed,
      Image.configure({ allowBase64: false }),
      TableKit,
    ],
    content: initial.html,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "learn-prose",
        role: "textbox",
        "aria-label": "Article body",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: e }) => update({ html: e.getHTML() }),
  });
  const save = useCallback(
    async (action = "save") => {
      if (saving.current || conflicted.current) return;
      saving.current = true;
      setBusy(true);
      setMessage(action === "save" ? "Saving…" : "Updating publication…");
      const snapshot = contentRef.current;
      const wasNew = !idRef.current;
      try {
        const response = await fetch("/api/admin/learn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: idRef.current,
            version: version.current,
            content: snapshot,
            action,
            scheduledAt: scheduledAt
              ? new Date(scheduledAt).toISOString()
              : undefined,
            reviewAt: reviewAt ? new Date(reviewAt).toISOString() : undefined,
          }),
        });
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 409) conflicted.current = true;
          throw new Error(result.error || "Save failed.");
        }
        idRef.current = result.id;
        setId(result.id);
        version.current = result.version;
        dirty.current = contentRef.current !== snapshot;
        setMessage(
          dirty.current
            ? "More changes waiting to save."
            : `${action === "publish" ? "Published" : action === "schedule" ? "Scheduled" : action === "review" ? "Ready for review" : action === "unpublish" ? "Unpublished" : "Saved"} successfully.`,
        );
        if (wasNew)
          window.history.replaceState(null, "", `/admin/learn/${result.id}`);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not save. Your changes are still in the editor.",
        );
      } finally {
        saving.current = false;
        setBusy(false);
      }
    },
    [scheduledAt, reviewAt],
  );
  useEffect(() => {
    const timer = setInterval(() => {
      if (dirty.current && contentRef.current.title.trim()) void save();
    }, 15000);
    return () => clearInterval(timer);
  }, [save]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  async function loadMedia() {
    setShowMedia(!showMedia);
    try {
      const r = await fetch("/api/admin/learn/media");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setMedia(data.media);
    } catch {
      setMessage("Media library could not be loaded.");
    }
  }
  async function upload(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("alt", alt);
      form.set("caption", caption);
      form.set("credit", credit);
      const r = await fetch("/api/admin/learn/media", {
        method: "POST",
        body: form,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setMedia((m) => [
        {
          ...data.media,
          asset: {
            mediaKind: data.kind,
            width: data.width,
            height: data.height,
            name: file.name,
          },
        },
        ...m,
      ]);
      setMessage("Media uploaded. Choose Insert or Use as cover.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  function insertMedia(m: Media) {
    if (m.asset.mediaKind === "IMAGE")
      editor
        ?.chain()
        .focus()
        .setImage({ src: mediaUrl(m.id), alt: m.alt })
        .run();
    else
      editor
        ?.chain()
        .focus()
        .insertContent({
          type: "mediaEmbed",
          attrs: {
            src: mediaUrl(m.id),
            kind: m.asset.mediaKind === "AUDIO" ? "audio" : "video",
          },
        })
        .run();
    if (m.caption || m.credit)
      editor
        ?.chain()
        .focus()
        .insertContent(
          `<p><em>${escape([m.caption, m.credit].filter(Boolean).join(" · "))}</em></p>`,
        )
        .run();
    setShowMedia(false);
  }
  async function loadRevisions() {
    if (!id) return;
    try {
      const r = await fetch(`/api/admin/learn/${id}`);
      const data = await r.json();
      if (!r.ok) throw new Error();
      setRevisions(data.revisions);
    } catch {
      setMessage("Revision history could not be loaded.");
    }
  }
  function restore(c: LearnContent) {
    update(c);
    editor?.commands.setContent(c.html);
    setRevisions([]);
    setMessage(
      "Revision restored into the editor. Save or publish when ready.",
    );
  }
  function field(key: keyof LearnContent, label: string, multiline = false) {
    const props = {
      className: "form-control mt-2",
      value: String(content[key]),
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => update({ [key]: e.target.value }),
    };
    return (
      <label className="block text-sm font-semibold">
        {label}
        {multiline ? <textarea {...props} rows={3} /> : <input {...props} />}
      </label>
    );
  }
  const toolbar = [
    { label: "Bold", run: () => editor?.chain().focus().toggleBold().run() },
    {
      label: "Italic",
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      label: "Bullets",
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Steps",
      run: () => editor?.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Quote / tip",
      run: () => editor?.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "Code",
      run: () => editor?.chain().focus().toggleCodeBlock().run(),
    },
    {
      label: "Table",
      run: () =>
        editor
          ?.chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
    { label: "Undo", run: () => editor?.chain().focus().undo().run() },
    { label: "Redo", run: () => editor?.chain().focus().redo().run() },
  ];
  return (
    <div className="mx-auto max-w-[1500px] p-4 sm:p-7">
      <div className="mb-7 flex flex-wrap justify-between gap-4">
        <div>
          <Link href="/admin/learn" className="text-sm text-primary">
            ← All articles
          </Link>
          <h1 className="font-display mt-3 text-3xl font-semibold">
            {initialId ? "Edit article" : "Write something useful."}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {id && (
            <Link
              href={`/learn/preview/${id}` as Route}
              target="_blank"
              className="text-sm text-primary"
            >
              Preview saved draft ↗
            </Link>
          )}
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void save()}
          >
            Save draft
          </Button>
          <Button disabled={busy} onClick={() => void save("publish")}>
            Publish
          </Button>
        </div>
      </div>
      <p
        role="status"
        className="mb-5 rounded-xl border border-border bg-card p-3 text-sm"
      >
        {message}
      </p>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <input
            aria-label="Article title"
            placeholder="Add a title"
            value={content.title}
            onChange={(e) => update({ title: e.target.value })}
            maxLength={240}
            className="form-control font-display text-3xl"
          />
          {field("slug", "Permalink: /learn/")}
          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex flex-wrap gap-2 border-b border-border p-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadMedia()}
              >
                Add media
              </Button>
              <select
                aria-label="Paragraph style"
                className="rounded-lg border border-border bg-background px-3 text-sm"
                onChange={(e) =>
                  e.target.value === "p"
                    ? editor?.chain().focus().setParagraph().run()
                    : editor
                        ?.chain()
                        .focus()
                        .toggleHeading({
                          level: Number(e.target.value) as 2 | 3 | 4,
                        })
                        .run()
                }
              >
                <option value="p">Paragraph</option>
                <option value="2">Heading 2</option>
                <option value="3">Heading 3</option>
                <option value="4">Heading 4</option>
              </select>
              {toolbar.map((t) => (
                <button
                  type="button"
                  key={t.label}
                  onClick={t.run}
                  className="min-h-10 rounded-lg px-3 text-sm hover:bg-muted"
                >
                  {t.label}
                </button>
              ))}
              <button
                onClick={() => setShowLink(!showLink)}
                className="min-h-10 rounded-lg px-3 text-sm hover:bg-muted"
              >
                Link
              </button>
            </div>
            {showLink && (
              <div className="flex flex-wrap gap-2 border-b border-border p-3">
                <input
                  aria-label="Link URL"
                  className="form-control"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://… or /learn/…"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (/^(https?:\/\/|\/(?!\/)|mailto:)/.test(linkUrl)) {
                      editor?.chain().focus().setLink({ href: linkUrl }).run();
                      setShowLink(false);
                    } else setMessage("Use a valid web link or internal path.");
                  }}
                >
                  Apply link
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    editor?.chain().focus().unsetLink().run();
                    setShowLink(false);
                  }}
                >
                  Remove link
                </Button>
              </div>
            )}
            <EditorContent editor={editor} className="learn-editor" />
          </section>
          {showMedia && (
            <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
              <h2 className="font-display text-xl">Editorial media library</h2>
              <p className="text-sm text-muted-foreground">
                Media becomes public only when referenced by a published
                article. Uploads use your workspace storage allowance.
              </p>
              <label className="block text-sm">
                Image description / alt text
                <input
                  className="form-control mt-1"
                  value={alt}
                  onChange={(e) => setAlt(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Caption
                <input
                  className="form-control mt-1"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Credit / source
                <input
                  className="form-control mt-1"
                  value={credit}
                  onChange={(e) => setCredit(e.target.value)}
                />
              </label>
              <label className="block text-sm font-semibold">
                Upload image, video or audio (25 MB maximum)
                <input
                  type="file"
                  className="mt-2 block w-full text-sm"
                  accept="image/png,image/jpeg,image/webp,video/mp4,audio/mpeg,audio/wav"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <div className="grid max-h-96 gap-4 overflow-y-auto sm:grid-cols-2">
                {media.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl border border-border p-3"
                  >
                    {m.asset.mediaKind === "IMAGE" ? (
                      <img
                        src={mediaUrl(m.id)}
                        alt={m.alt}
                        width={320}
                        height={180}
                        className="aspect-video w-full rounded-lg object-cover"
                      />
                    ) : (
                      <p>{m.asset.name}</p>
                    )}
                    <p className="mt-2 truncate text-xs">{m.asset.name}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-primary">
                      <button
                        onClick={() => insertMedia(m)}
                        className="min-h-10"
                      >
                        Insert
                      </button>
                      {m.asset.mediaKind === "IMAGE" && (
                        <>
                          <button
                            onClick={() => {
                              update({ coverId: m.id, coverAlt: m.alt });
                              setShowMedia(false);
                            }}
                            className="min-h-10"
                          >
                            Use as cover
                          </button>
                          <button
                            onClick={() => update({ socialImageId: m.id })}
                            className="min-h-10"
                          >
                            Social image
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="space-y-5 rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">
              Summary & search appearance
            </h2>
            {field("excerpt", "Article excerpt", true)}
            {field("seoTitle", "SEO title (optional override)")}
            {field("description", "Meta description (optional override)", true)}
            <div className="rounded-xl bg-muted p-5">
              <p className="text-xs text-muted-foreground">
                Search preview · appearance may vary
              </p>
              <p className="mt-2 text-xs">
                creator.aiwamediagroup.com / learn / {content.slug}
              </p>
              <p className="mt-2 text-xl text-primary">
                {content.seoTitle || content.title || "Your search title"}
              </p>
              <p className="mt-2 text-sm">
                {content.description ||
                  content.excerpt ||
                  "Write a useful summary of what the reader will learn."}
              </p>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                {(content.seoTitle || content.title).length} title characters ·{" "}
                {(content.description || content.excerpt).length} description
                characters
              </li>
              <li>
                {content.html.includes("<h2")
                  ? "✓ Section headings included"
                  : "Add section headings for easier scanning."}
              </li>
              <li>
                {content.html.includes('href="/learn/')
                  ? "✓ Related guide linked"
                  : "Consider linking to a related guide."}
              </li>
              <li>
                {content.coverAlt
                  ? "✓ Cover description included"
                  : "Describe the cover image."}
              </li>
            </ul>
            <label className="flex gap-3 text-sm">
              <input
                type="checkbox"
                checked={content.noindex}
                onChange={(e) => update({ noindex: e.target.checked })}
              />
              Exclude from search indexing
            </label>
          </section>
          <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Revision history</h2>
            <Button
              variant="secondary"
              disabled={!id}
              onClick={() => void loadRevisions()}
            >
              Load recent revisions
            </Button>
            {revisions.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 border-t border-border py-3 text-sm"
              >
                <span>
                  {new Date(r.createdAt).toLocaleString()} · {r.content.title}
                </span>
                <button
                  className="text-primary"
                  onClick={() => restore(r.content)}
                >
                  Restore draft
                </button>
              </div>
            ))}
          </section>
        </div>
        <aside className="space-y-5">
          <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Publish</h2>
            <Button
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={() => void save("review")}
            >
              Submit for review
            </Button>
            <label className="block text-sm font-semibold">
              Schedule (your local time)
              <input
                type="datetime-local"
                className="form-control mt-2"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </label>
            <Button
              variant="secondary"
              disabled={busy || !scheduledAt}
              onClick={() => void save("schedule")}
            >
              Schedule publication
            </Button>
            <label className="block text-sm font-semibold">
              Review content on
              <input
                type="date"
                className="form-control mt-2"
                value={reviewAt}
                onChange={(e) => setReviewAt(e.target.value)}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Saving new changes cancels any existing publication schedule.
              Schedule again when ready.
            </p>
            {id && (
              <button
                className="min-h-10 text-sm text-destructive"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Unpublish this article? It will no longer be publicly readable.",
                    )
                  )
                    void save("unpublish");
                }}
              >
                Unpublish article
              </button>
            )}
          </section>
          <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Organize</h2>
            <label className="block text-sm">
              Content type
              <select
                className="form-control mt-2"
                value={content.type}
                onChange={(e) =>
                  update({ type: e.target.value as LearnContent["type"] })
                }
              >
                {learnTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Topic
              <select
                className="form-control mt-2"
                value={content.topic}
                onChange={(e) =>
                  update({ topic: e.target.value as LearnContent["topic"] })
                }
              >
                {learnTopics.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            {field("author", "Author")}
            {field("authorBio", "Author biography", true)}
            <label className="block text-sm">
              Tags (comma separated)
              <input
                className="form-control mt-2"
                defaultValue={content.tags.join(",")}
                onChange={(e) =>
                  update({
                    tags: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .slice(0, 10),
                  })
                }
              />
            </label>
            <label className="flex gap-3 text-sm">
              <input
                type="checkbox"
                checked={content.featured}
                onChange={(e) => update({ featured: e.target.checked })}
              />
              Feature on Learn
            </label>
          </section>
          <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Cover image</h2>
            {content.coverId && (
              <img
                src={mediaUrl(content.coverId)}
                alt={content.coverAlt}
                width={480}
                height={270}
                className="aspect-video w-full rounded-xl object-cover"
                style={{
                  objectPosition: `${content.focalX}% ${content.focalY}%`,
                }}
              />
            )}
            <Button variant="secondary" onClick={() => void loadMedia()}>
              Choose cover
            </Button>
            {field("coverAlt", "Cover image description")}
            {(["focalX", "focalY"] as const).map((key) => (
              <label key={key} className="block text-sm">
                {key === "focalX"
                  ? "Horizontal focal point"
                  : "Vertical focal point"}
                <input
                  className="mt-2 w-full"
                  type="range"
                  min="0"
                  max="100"
                  value={content[key]}
                  onChange={(e) => update({ [key]: Number(e.target.value) })}
                />
              </label>
            ))}
          </section>
          <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Connect to the studio</h2>
            <label className="block text-sm">
              Related tool
              <select
                className="form-control mt-2"
                value={content.tool}
                onChange={(e) =>
                  update({ tool: e.target.value as LearnContent["tool"] })
                }
              >
                <option value="">No tool CTA</option>
                {Object.entries(learnTools).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {field("ctaLabel", "Button label")}
            {field("prompt", "Copyable example prompt", true)}
          </section>
          <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Language & translations</h2>
            {field("locale", "Language code (en, ar…)")}
            {field("translationKey", "Shared translation key")}
            <p className="text-xs text-muted-foreground">
              Translations share a key and have different language codes and
              unique URLs. Arabic articles use right-to-left reading layout.
            </p>
          </section>
          <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Starting points</h2>
            {["Tutorial", "Product announcement", "Troubleshooting"].map(
              (t) => (
                <button
                  key={t}
                  className="block min-h-10 text-sm text-primary"
                  onClick={() => {
                    if (
                      content.html !== "<p></p>" &&
                      !window.confirm(
                        "Replace the article body with this starting template?",
                      )
                    )
                      return;
                    const html =
                      t === "Tutorial"
                        ? "<h2>What you’ll create</h2><p>Describe the result.</p><h2>Before you start</h2><p>List what you need.</p><h2>Step by step</h2><ol><li><p>Start here.</p></li></ol><h2>Make it your own</h2><p>Add useful variations.</p>"
                        : t === "Troubleshooting"
                          ? "<h2>The problem</h2><p>Describe the symptom.</p><h2>How to fix it</h2><p>Explain the steps.</p><h2>Still need help?</h2><p>Explain the next option.</p>"
                          : "<h2>What’s new</h2><p>Introduce the feature.</p><h2>What you can make</h2><p>Show a real use case.</p><h2>Get started</h2><p>Explain the first step.</p>";
                    editor?.commands.setContent(html);
                    update({ html });
                  }}
                >
                  {t}
                </button>
              ),
            )}
            <button
              className="min-h-10 text-sm text-primary"
              onClick={() => {
                const key = crypto.randomUUID();
                idRef.current = undefined;
                setId(undefined);
                version.current = 1;
                update({
                  ...contentRef.current,
                  slug: `${contentRef.current.slug.slice(0, 115)}-copy-${key.slice(0, 8)}`,
                  translationKey: key,
                });
                window.history.replaceState(null, "", "/admin/learn/new");
                setMessage("Duplicated into a new unsaved draft.");
              }}
            >
              Duplicate as new draft
            </button>
            <button
              className="min-h-10 text-sm text-primary"
              onClick={() => {
                const c = emptyContent(crypto.randomUUID());
                if (
                  window.confirm("Clear the editor and start a new article?")
                ) {
                  idRef.current = undefined;
                  setId(undefined);
                  version.current = 1;
                  restore(c);
                }
              }}
            >
              New blank article
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
