"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/creative";
import { Icon } from "@/components/ui/icon";
import { StatusDot, Tape } from "@/components/ui/sketch";

export type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  generationCount: number;
  assetCount: number;
};

export function ProjectManager({
  organizationId,
  organizationSlug,
  canWrite,
  initialProjects,
}: {
  organizationId: string;
  organizationSlug: string;
  canWrite: boolean;
  initialProjects: ProjectRow[];
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visibleProjects = useMemo(
    () => projects.filter((project) => showArchived || !project.archivedAt),
    [projects, showArchived],
  );

  function startCreate() {
    setEditingId("new");
    setName("");
    setDescription("");
    setError(null);
  }

  function startEdit(project: ProjectRow) {
    setEditingId(project.id);
    setName(project.name);
    setDescription(project.description ?? "");
    setError(null);
  }

  async function refresh() {
    const response = await fetch(
      `/api/projects?organizationId=${encodeURIComponent(organizationId)}&includeArchived=true`,
      { cache: "no-store" },
    );
    const body = (await response.json()) as {
      error?: string;
      projects?: Array<
        Omit<ProjectRow, "generationCount" | "assetCount"> & {
          _count: { generationJobs: number; assets: number };
        }
      >;
    };
    if (!response.ok || !body.projects) {
      throw new Error(body.error ?? "Unable to refresh projects.");
    }
    setProjects(
      body.projects.map((project) => ({
        ...project,
        generationCount: project._count.generationJobs,
        assetCount: project._count.assets,
      })),
    );
  }

  async function save() {
    if (!canWrite || !name.trim() || busyId) return;
    const targetId = editingId ?? "new";
    setBusyId(targetId);
    setError(null);
    try {
      const response =
        editingId === "new"
          ? await fetch("/api/projects", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                organizationId,
                name,
                description: description || null,
              }),
            })
          : await fetch(`/api/projects/${editingId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "update",
                organizationId,
                name,
                description: description || null,
              }),
            });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error ?? "Unable to save project.");
      await refresh();
      setEditingId(null);
      setName("");
      setDescription("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save project.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function setArchived(project: ProjectRow, archived: boolean) {
    if (!canWrite || busyId) return;
    if (
      archived &&
      !window.confirm(
        `Archive “${project.name}”? Existing media stays available, but new generations cannot be assigned to it.`,
      )
    ) {
      return;
    }
    setBusyId(project.id);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "archive",
          organizationId,
          archived,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error ?? "Unable to update project.");
      await refresh();
      if (editingId === project.id) setEditingId(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to update project.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page-reveal">
      <section className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Eyebrow>Creative organization</Eyebrow>
          <h1 className="font-display mt-3 text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-5xl">
            Projects
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Keep generations and their media together by campaign, client, or
            idea. Archiving preserves history without cluttering new work.
          </p>
        </div>
        {canWrite ? (
          <Button type="button" onClick={startCreate}>
            <Icon name="plus" className="size-4" />
            New project
          </Button>
        ) : null}
      </section>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {projects.filter((project) => !project.archivedAt).length} active ·{" "}
          {projects.filter((project) => project.archivedAt).length} archived
        </p>
        <label className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
            className="size-4 accent-primary"
          />
          Show archived
        </label>
      </div>

      {editingId ? (
        <section
          aria-label={editingId === "new" ? "Create project" : "Edit project"}
          className="paper-sheet relative mt-5 rounded-[24px] border border-border p-5 sm:p-6"
        >
          <Tape className="-top-1 right-10 hidden rotate-6 sm:block" />
          <h2 className="font-display text-xl font-semibold text-foreground">
            {editingId === "new" ? "Start a project" : "Edit project"}
          </h2>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-foreground">
              Project name
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                className="form-control"
                placeholder="Ramadan launch campaign"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-foreground">
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={2000}
                className="form-control min-h-28 py-3"
                placeholder="Optional context, deliverables, client notes, or creative direction."
              />
              <span className="text-right text-xs font-normal text-subtle-foreground">
                {description.length} / 2000
              </span>
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditingId(null)}
                disabled={Boolean(busyId)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void save()}
                disabled={!name.trim() || Boolean(busyId)}
                aria-busy={Boolean(busyId)}
              >
                {busyId
                  ? "Saving…"
                  : editingId === "new"
                    ? "Create project"
                    : "Save changes"}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-destructive bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {visibleProjects.length ? (
        <section className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {visibleProjects.map((project) => (
            <article
              key={project.id}
              className="hover-lift relative overflow-hidden rounded-[22px] border border-border bg-card/88 p-5 shadow-xs"
            >
              <span className="absolute inset-x-0 top-0 h-0.5 bg-[var(--gradient-spectrum)] opacity-50" />
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon name="projects" className="size-5" />
                </span>
                <StatusDot tone={project.archivedAt ? "warning" : "success"}>
                  {project.archivedAt ? "Archived" : "Active"}
                </StatusDot>
              </div>
              <h2 className="font-display mt-5 text-xl font-semibold text-foreground">
                {project.name}
              </h2>
              <p className="mt-2 min-h-10 text-sm leading-5 text-muted-foreground">
                {project.description || "No description yet."}
              </p>
              <dl className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-surface-sunken p-3">
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-subtle-foreground">
                    Generations
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                    {project.generationCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-subtle-foreground">
                    Assets
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                    {project.assetCount}
                  </dd>
                </div>
              </dl>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Button asChild size="sm" variant="secondary">
                  <Link
                    href={`/app/${organizationSlug}/projects/${project.id}`}
                  >
                    Open
                  </Link>
                </Button>
                {canWrite && !project.archivedAt ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => startEdit(project)}
                    disabled={Boolean(busyId)}
                  >
                    Edit
                  </Button>
                ) : null}
                {canWrite ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void setArchived(project, !project.archivedAt)
                    }
                    disabled={Boolean(busyId)}
                    className={project.archivedAt ? "" : "text-destructive"}
                  >
                    {busyId === project.id
                      ? "Updating…"
                      : project.archivedAt
                        ? "Restore"
                        : "Archive"}
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="mt-6 rounded-[24px] border border-dashed border-border bg-card/70 p-10 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Icon name="projects" className="size-6" />
          </span>
          <h2 className="font-display mt-4 text-xl font-semibold text-foreground">
            {showArchived ? "No projects yet" : "Your creative desk is clear"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Create a project to group new generations and their output assets.
          </p>
          {canWrite ? (
            <Button type="button" className="mt-5" onClick={startCreate}>
              Create your first project
            </Button>
          ) : null}
        </section>
      )}
    </div>
  );
}
