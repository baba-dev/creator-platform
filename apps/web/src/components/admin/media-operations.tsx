"use client";
import { useEffect, useState } from "react";
import type { mediaOperationsSnapshot } from "@/lib/media-operations";
import { derivativeKinds } from "@aiwa/assets/media-status";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/creative";
import { StatusBadge } from "./primitives";
type Snapshot = Awaited<ReturnType<typeof mediaOperationsSnapshot>>;
type Task = Snapshot["attention"][number];
type Detail = Task & {
  attempts: {
    cycle: number;
    number: number;
    outcome: string | null;
    errorCode: string | null;
    startedAt: string;
    finishedAt: string | null;
  }[];
};
export function MediaOperations({
  initial,
  canManage,
}: {
  initial: Snapshot;
  canManage: boolean;
}) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [taskRows, setTaskRows] = useState<Task[] | null>(null);
  const [taskStatus, setTaskStatus] = useState("FAILED");
  const [taskCursor, setTaskCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function refresh() {
    try {
      const response = await fetch("/api/admin/media", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to refresh media diagnostics.");
      setData(await response.json());
      setError(null);
    } catch {
      setError(
        "Diagnostics could not refresh. The last snapshot is still shown.",
      );
    }
  }
  useEffect(() => {
    let active = true;
    let loading = false;
    const controller = new AbortController();
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible" || loading) return;
      loading = true;
      try {
        const response = await fetch("/api/admin/media", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unavailable");
        const snapshot = await response.json();
        if (active) {
          setData(snapshot);
          setError(null);
        }
      } catch {
        if (active)
          setError(
            "Diagnostics could not refresh. The last snapshot is still shown.",
          );
      } finally {
        loading = false;
      }
    }, 15_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);
  async function inspect(task: Task) {
    setBusy(task.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/media/${task.id}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Unable to load task history.");
      setDetail(await response.json());
    } catch {
      setError("Unable to load task history.");
    } finally {
      setBusy(null);
    }
  }
  async function retry(task: Task) {
    setBusy(task.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/media/${task.id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycle: task.cycle }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Retry unavailable.");
      setDetail(null);
      setTaskRows(null);
      setTaskCursor(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Retry unavailable.");
    } finally {
      setBusy(null);
    }
  }
  async function browseTasks(cursor?: string) {
    setBusy("browse");
    try {
      const params = new URLSearchParams({ status: taskStatus });
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/admin/media/tasks?${params}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Task list unavailable.");
      const body = (await response.json()) as {
        tasks: Task[];
        nextCursor: string | null;
      };
      setTaskRows(body.tasks);
      setTaskCursor(body.nextCursor);
    } catch {
      setError("Unable to browse tasks. Try refreshing.");
    } finally {
      setBusy(null);
    }
  }
  const visibleTasks = taskRows ?? data.attention;
  const cards = [
    [
      "Queued / cooling down",
      (data.counts.PENDING ?? 0) + (data.counts.RETRY_WAIT ?? 0),
    ],
    ["Processing", data.counts.PROCESSING ?? 0],
    ["Needs review", data.counts.REVIEW ?? 0],
    ["Completed / 15 min", data.completedLast15Minutes],
  ] as const;
  return (
    <div className="min-w-0 px-4 py-7 sm:px-7 lg:px-9">
      <Eyebrow>Operations</Eyebrow>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight">
            Media processing
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Preview preparation, native capacity and worker health. Original
            downloads and generation charges are independent of optional
            previews.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Snapshot: {new Date(data.sampledAt).toLocaleString()} · refreshes every
        15 seconds while visible
      </p>
      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-border bg-card p-5"
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 font-display text-3xl font-semibold tabular-nums">
              {value}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>
          Oldest queued: {Math.floor(data.oldestQueueAgeSeconds / 60)} min
        </span>
        <span>
          Failed attempts / 15 min: {data.failedAttemptsLast15Minutes}
        </span>
        <span>
          Native capacity:{" "}
          {data.capacity.expired
            ? "Expired ownership"
            : data.capacity.occupied
              ? "Occupied"
              : "Free"}
        </span>
      </div>
      <section className="mt-6 space-y-3" aria-label="Media alerts">
        {data.alerts.length ? (
          data.alerts.map((alert) => (
            <div
              key={alert.code}
              className="rounded-xl border border-warning/25 bg-warning/10 p-4"
            >
              <p className="text-sm font-semibold">{alert.message}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {alert.action}
              </p>
              <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                {alert.code}
              </p>
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            No diagnostic thresholds exceeded in this snapshot.
          </p>
        )}
      </section>
      <section className="mt-7 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-xl font-semibold">Worker health</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Fresh heartbeats expire after 90 seconds. Host readings can repeat
          across roles; do not add them together.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {data.workers.map((worker, index) => (
            <div
              key={`${worker.role}-${index}`}
              className="rounded-xl border border-border p-4 text-xs"
            >
              <p className="font-semibold">
                {worker.role} ({worker.instanceId.slice(0, 8)}) ·{" "}
                {Math.round(worker.rssBytes / 1048576)} MiB RSS
              </p>
              <p className="mt-2 text-muted-foreground">
                Loop p99 / max: {worker.eventLoopP99Ms} /{" "}
                {worker.eventLoopMaxMs} ms · stalled locks:{" "}
                {worker.stalledSinceStart}
              </p>
              <p className="mt-1 text-muted-foreground">
                Host RAM available:{" "}
                {worker.host.availableMemoryPercent?.toFixed(1) ??
                  "unavailable"}
                % · CPU steal:{" "}
                {worker.host.cpuStealPercent?.toFixed(1) ?? "unavailable"}%
              </p>
              <p className="mt-1 text-muted-foreground">
                Stall avg10 — CPU:{" "}
                {worker.host.cpuPressureAvg10 ?? "unavailable"} · memory:{" "}
                {worker.host.memoryPressureAvg10 ?? "unavailable"} · I/O:{" "}
                {worker.host.ioPressureAvg10 ?? "unavailable"}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className="mt-7 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="p-5">
          <h2 className="font-display text-xl font-semibold">
            Tasks requiring attention
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Latest 50 failed, review or processing tasks by default. Browse by
            state to inspect older tasks. Inspect history before retrying.
            Review and expired capacity require confirmed-stopped operator
            recovery.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3 border-t border-border p-4">
          <label className="grid gap-1 text-xs font-semibold">
            Task state
            <select
              className="form-control"
              value={taskStatus}
              onChange={(event) => {
                setTaskStatus(event.target.value);
                setTaskCursor(null);
                setTaskRows(null);
              }}
            >
              {[
                "FAILED",
                "REVIEW",
                "PROCESSING",
                "PENDING",
                "RETRY_WAIT",
                "SUCCEEDED",
              ].map((state) => (
                <option key={state}>{state}</option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => void browseTasks()}
          >
            Browse state
          </Button>
          {taskCursor ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy !== null}
              onClick={() => void browseTasks(taskCursor)}
            >
              Next 50
            </Button>
          ) : null}
          {taskRows ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setTaskRows(null);
                setTaskCursor(null);
              }}
            >
              Show recent attention
            </Button>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="border-y border-border bg-muted/40 text-muted-foreground">
              <tr>
                <th className="p-3">Task / target</th>
                <th className="p-3">Kind</th>
                <th className="p-3">State</th>
                <th className="p-3">Cycle / attempts</th>
                <th className="p-3">Error code</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleTasks.map((task) => (
                <tr key={task.id}>
                  <td className="p-3 font-mono text-[10px]">
                    <p>{task.id}</p>
                    <p className="mt-1 text-muted-foreground">
                      {task.targetId}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Org: {task.organizationId}
                    </p>
                  </td>
                  <td className="p-3">{task.kind}</td>
                  <td className="p-3">
                    <StatusBadge
                      tone={task.status === "FAILED" ? "danger" : "warning"}
                    >
                      {task.status}
                    </StatusBadge>
                  </td>
                  <td className="p-3 tabular-nums">
                    {task.cycle} / {task.attemptCount} of {task.maxAttempts}
                  </td>
                  <td className="p-3 font-mono text-[10px]">
                    {task.errorCode ?? "—"}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy !== null}
                        onClick={() => void inspect(task)}
                      >
                        History
                      </Button>
                      {canManage &&
                      task.status === "FAILED" &&
                      task.cycle < 3 &&
                      derivativeKinds.includes(
                        task.kind as (typeof derivativeKinds)[number],
                      ) ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy !== null}
                          onClick={() => void retry(task)}
                        >
                          Retry preview
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visibleTasks.length ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No tasks requiring attention.
          </p>
        ) : null}
      </section>
      {detail ? (
        <section
          aria-label="Task attempt history"
          className="mt-6 rounded-2xl border border-border bg-card p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">
              Attempt history
            </h2>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setDetail(null)}
            >
              Close history
            </Button>
          </div>
          <p className="mt-2 break-all font-mono text-xs">{detail.id}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Latest 30 attempts, including previous retry cycles. Refresh history
            to check a changed state.
          </p>
          <ul className="mt-4 divide-y divide-border">
            {detail.attempts.map((attempt) => (
              <li
                key={`${attempt.cycle}-${attempt.number}`}
                className="flex flex-wrap justify-between gap-2 py-3 text-xs"
              >
                <span>
                  Cycle {attempt.cycle} · attempt {attempt.number}
                </span>
                <span>
                  {attempt.outcome ?? "Still owned / interrupted"} ·{" "}
                  {attempt.errorCode ?? "—"}
                </span>
                <span className="text-muted-foreground">
                  {new Date(attempt.startedAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
          {!detail.attempts.length ? (
            <p className="mt-3 text-xs text-muted-foreground">
              No recorded native attempts; the task may have imported an
              exhausted legacy delivery.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
