"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";

export type InvitationRow = {
  id: string;
  token: string;
  role: "ORGANIZATION_MEMBER" | "ORGANIZATION_VIEWER";
  email: string | null;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
  createdBy: { name: string; email: string };
  acceptedBy: { name: string; email: string } | null;
};

type Feedback = { tone: "error" | "success"; message: string } | null;

export function InvitationManager({
  organizationId,
  invitations,
  canManage,
  memberCount,
  maxSeats = 10,
}: {
  organizationId: string;
  invitations: InvitationRow[];
  canManage: boolean;
  memberCount: number;
  maxSeats?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState("ORGANIZATION_MEMBER");
  const [email, setEmail] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const isFull = memberCount >= maxSeats;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage || isFull) return;
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/invitations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role,
            email: email.trim() || undefined,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        token?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create invitation link.");
      }
      setEmail("");
      setFeedback({
        tone: "success",
        message: "Invitation link created. Copy and share it below.",
      });
      if (data.token) {
        copyInviteUrl(data.token);
      }
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setFeedback({
        tone: "error",
        message:
          err instanceof Error
            ? err.message
            : "Failed to create invitation link.",
      });
    }
  }

  async function handleRevoke(invitationId: string) {
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/invitations/${invitationId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? "Failed to revoke invitation.");
      }
      setFeedback({ tone: "success", message: "Invitation link revoked." });
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setFeedback({
        tone: "error",
        message:
          err instanceof Error ? err.message : "Failed to revoke invitation.",
      });
    }
  }

  function copyInviteUrl(token: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/invite/${token}`;
    void navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => {
      setCopiedToken((prev) => (prev === token ? null : prev));
    }, 3000);
  }

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">
            Shareable invitation links
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Generate and share manual invitation links for new team members.
          </p>
        </div>
        {isFull ? (
          <span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
            Seat capacity reached (10/10)
          </span>
        ) : null}
      </div>

      {feedback ? (
        <p
          role="status"
          className={`mt-4 rounded-xl border px-4 py-3 text-xs font-semibold ${
            feedback.tone === "error"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-success/30 bg-success/10 text-success"
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

      {canManage && !isFull ? (
        <form
          onSubmit={handleCreate}
          className="mt-5 grid gap-3 rounded-xl border border-border bg-background/50 p-4 sm:grid-cols-[160px_minmax(180px,1fr)_auto]"
        >
          <div>
            <label
              htmlFor="invite-role-select"
              className="mb-1 block text-xs font-semibold"
            >
              Invited role
            </label>
            <select
              id="invite-role-select"
              value={role}
              disabled={pending}
              onChange={(e) => setRole(e.target.value)}
              className="min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="ORGANIZATION_MEMBER">Member</option>
              <option value="ORGANIZATION_VIEWER">Viewer</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="invite-email-input"
              className="mb-1 block text-xs font-semibold"
            >
              Lock to specific email (optional)
            </label>
            <input
              id="invite-email-input"
              type="email"
              value={email}
              disabled={pending}
              placeholder="Leave empty for anyone with link"
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            ></input>
          </div>

          <Button disabled={pending} className="min-h-10 self-end">
            {pending ? "Creating…" : "Create invitation link"}
          </Button>
        </form>
      ) : null}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-xs">
          <thead className="border-b border-border text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="pb-3 pr-4">Invited role</th>
              <th className="pb-3 pr-4">Recipient</th>
              <th className="pb-3 pr-4">Status</th>
              <th className="pb-3 pr-4">Expires</th>
              <th className="pb-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invitations.map((inv) => {
              const isPending = inv.status === "PENDING";
              const isCopied = copiedToken === inv.token;

              return (
                <tr key={inv.id}>
                  <td className="py-3 pr-4 font-semibold">
                    {inv.role === "ORGANIZATION_MEMBER" ? "Member" : "Viewer"}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {inv.email ? (
                      <span className="font-mono">{inv.email}</span>
                    ) : (
                      "Anyone with link"
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge
                      tone={
                        inv.status === "ACCEPTED"
                          ? "success"
                          : inv.status === "PENDING"
                            ? "info"
                            : inv.status === "REVOKED"
                              ? "danger"
                              : "neutral"
                      }
                    >
                      {inv.status}
                    </StatusBadge>
                  </td>
                  <td className="py-3 pr-4 font-mono text-[10px] tabular-nums text-muted-foreground">
                    {new Date(inv.expiresAt).toLocaleDateString("en-OM", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {isPending ? (
                        <>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="min-h-10"
                            onClick={() => copyInviteUrl(inv.token)}
                          >
                            {isCopied ? "Copied!" : "Copy link"}
                          </Button>
                          {canManage ? (
                            <ConfirmDialog
                              triggerLabel="Revoke"
                              title="Revoke invitation link?"
                              description="Anyone with this link will no longer be able to join using it."
                              confirmLabel="Revoke link"
                              destructive
                              disabled={pending}
                              onConfirm={() => handleRevoke(inv.id)}
                            />
                          ) : null}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {invitations.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted-foreground">
            No invitation links generated yet.
          </p>
        ) : null}
      </div>
    </section>
  );
}
