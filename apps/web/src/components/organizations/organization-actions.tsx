"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";

export function OrganizationActions({
  organizationId,
  name,
  status,
  canManage,
  allowStatus = true,
}: {
  organizationId: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
  canManage: boolean;
  allowStatus?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  async function update(body: object) {
    setFeedback(null);
    const response = await fetch(`/api/organizations/${organizationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok)
      throw new Error(result.error ?? "Organization update failed.");
    startTransition(() => router.refresh());
  }
  if (!canManage) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-2xl font-semibold">Administration</h2>
      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const next = String(
            new FormData(event.currentTarget).get("name") ?? "",
          );
          void update({ name: next })
            .then(() => setFeedback("Organization renamed."))
            .catch((error: unknown) =>
              setFeedback(
                error instanceof Error ? error.message : "Rename failed.",
              ),
            );
        }}
      >
        <label className="sr-only" htmlFor="organization-name">
          Organization name
        </label>
        <input
          id="organization-name"
          name="name"
          required
          minLength={2}
          maxLength={80}
          defaultValue={name}
          disabled={pending}
          className="min-h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm"
        />
        <Button disabled={pending}>Rename</Button>
      </form>
      {allowStatus ? (
        <div className="mt-4">
          <ConfirmDialog
            destructive={status === "ACTIVE"}
            disabled={pending || status === "CLOSED"}
            triggerLabel={
              status === "SUSPENDED"
                ? "Reactivate organization"
                : "Suspend organization"
            }
            title={
              status === "SUSPENDED"
                ? `Reactivate ${name}?`
                : `Suspend ${name}?`
            }
            description={
              status === "SUSPENDED"
                ? "Workspace access will be restored."
                : "Workspace access will stop and active organization sessions will be cleared. Historical data is preserved."
            }
            confirmLabel={
              status === "SUSPENDED" ? "Reactivate" : "Suspend organization"
            }
            onConfirm={async () => {
              await update({
                status: status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED",
              });
              setFeedback(
                status === "SUSPENDED"
                  ? "Organization reactivated."
                  : "Organization suspended.",
              );
            }}
          />
        </div>
      ) : null}
      {feedback ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          {feedback}
        </p>
      ) : null}
    </section>
  );
}
