"use client";

import { platformRoles, type PlatformRole } from "@aiwa/authz";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";

type Feedback = { tone: "error" | "success"; message: string } | null;

export function UserPlatformRoleForm({
  userId,
  currentRole,
  isPlatformOwner,
}: {
  userId: string;
  currentRole: PlatformRole;
  isPlatformOwner: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<PlatformRole>(currentRole);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function handleSaveRole(e: React.FormEvent) {
    e.preventDefault();
    if (!isPlatformOwner) return;
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update role.");
      setFeedback({ tone: "success", message: "Platform role updated." });
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setFeedback({
        tone: "error",
        message: err instanceof Error ? err.message : "Failed to update role.",
      });
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-display text-lg font-semibold">Platform role</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {isPlatformOwner
          ? "Modify platform permissions and operational access for this account."
          : "Changing platform roles is restricted to Platform Owners."}
      </p>

      {feedback ? (
        <p
          role="status"
          className={`mt-3 rounded-xl border px-3 py-2 text-xs font-semibold ${
            feedback.tone === "error"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-success/30 bg-success/10 text-success"
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

      <form
        onSubmit={handleSaveRole}
        className="mt-4 flex flex-wrap items-end gap-3"
      >
        <div className="min-w-[200px] flex-1">
          <label
            htmlFor="platform-role-select"
            className="mb-1 block text-xs font-semibold"
          >
            Assigned role
          </label>
          <select
            id="platform-role-select"
            value={role}
            disabled={!isPlatformOwner || pending}
            onChange={(e) => setRole(e.target.value as PlatformRole)}
            className="min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {platformRoles.map((r) => (
              <option key={r} value={r}>
                {r.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
        {isPlatformOwner ? (
          <Button
            type="submit"
            disabled={pending || role === currentRole}
            className="min-h-10"
          >
            {pending ? "Saving…" : "Save role"}
          </Button>
        ) : null}
      </form>
    </div>
  );
}

export function UserAccessActions({
  userId,
  userName,
  isDisabled,
  isEmailVerified = false,
  isSelf,
  canManage,
  canVerifyEmail = false,
}: {
  userId: string;
  userName: string;
  isDisabled: boolean;
  isEmailVerified?: boolean;
  isSelf: boolean;
  canManage: boolean;
  canVerifyEmail?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function mutateAccess(disabled: boolean) {
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update access.");
      setFeedback({
        tone: "success",
        message: disabled ? "User access disabled." : "User access enabled.",
      });
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setFeedback({
        tone: "error",
        message:
          err instanceof Error ? err.message : "Failed to update access.",
      });
    }
  }

  async function mutateEmailVerification(verified: boolean) {
    setFeedback(null);
    const reason = verified
      ? window.prompt(
          "Administrative verification bypasses normal mailbox proof. Enter an audit reason (minimum 8 characters):",
        )?.trim()
      : undefined;
    if (verified && (!reason || reason.length < 8)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified, reason }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok)
        throw new Error(data.error ?? "Failed to update email verification.");
      setFeedback({
        tone: "success",
        message: verified
          ? "User email marked as verified."
          : "User email marked as unverified.",
      });
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setFeedback({
        tone: "error",
        message:
          err instanceof Error
            ? err.message
            : "Failed to update email verification.",
      });
    }
  }

  async function revokeSessions() {
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke_sessions" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to revoke sessions.");
      setFeedback({ tone: "success", message: "All active sessions revoked." });
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setFeedback({
        tone: "error",
        message:
          err instanceof Error ? err.message : "Failed to revoke sessions.",
      });
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-display text-lg font-semibold">
        Access & verification
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Manage email verification, login capability, or revoke active sessions.
      </p>

      {feedback ? (
        <p
          role="status"
          className={`mt-3 rounded-xl border px-3 py-2 text-xs font-semibold ${
            feedback.tone === "error"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-success/30 bg-success/10 text-success"
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        {canManage ? (
          isEmailVerified ? (
            <ConfirmDialog
              triggerLabel="Mark email unverified"
              title={`Mark ${userName}'s email as unverified?`}
              description="The user will be required to re-verify their email before accepting new workspace invitations."
              confirmLabel="Mark unverified"
              disabled={pending}
              onConfirm={() => mutateEmailVerification(false)}
            />
          ) : canVerifyEmail ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => mutateEmailVerification(true)}
              className="min-h-10"
            >
              {pending ? "Working…" : "Administratively verify email"}
            </Button>
          ) : null
        ) : null}

        {canManage ? (
          isDisabled ? (
            <Button
              type="button"
              disabled={pending}
              onClick={() => mutateAccess(false)}
              className="min-h-10"
            >
              {pending ? "Working…" : "Enable user access"}
            </Button>
          ) : (
            <ConfirmDialog
              triggerLabel="Disable user access"
              title={`Disable access for ${userName}?`}
              description="The user will be immediately logged out of all active sessions and prevented from logging in until reactivated."
              confirmLabel="Disable access"
              destructive
              disabled={pending || isSelf}
              onConfirm={() => mutateAccess(true)}
            />
          )
        ) : null}

        {canManage ? (
          <ConfirmDialog
            triggerLabel="Revoke all active sessions"
            title={`Revoke sessions for ${userName}?`}
            description="The user will be signed out from all browsers and active devices immediately."
            confirmLabel="Revoke sessions"
            destructive
            disabled={pending}
            onConfirm={revokeSessions}
          />
        ) : null}
      </div>
      {isSelf ? (
        <p className="mt-2 text-[10px] text-muted-foreground">
          You cannot disable your own active administrator account.
        </p>
      ) : null}
    </div>
  );
}

export function AttachOrganizationForm({
  userId,
  organizations,
  canManage,
}: {
  userId: string;
  organizations: { id: string; name: string; slug: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedOrg, setSelectedOrg] = useState("");
  const [role, setRole] = useState("ORGANIZATION_MEMBER");
  const [cap, setCap] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);

  if (!canManage || organizations.length === 0) return null;

  async function handleAttach(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrg) return;
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/memberships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: selectedOrg,
          role,
          monthlySpendingCapCredits: cap.trim() === "" ? null : cap.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok)
        throw new Error(data.error ?? "Failed to add user to organization.");
      setFeedback({
        tone: "success",
        message: "User attached to organization.",
      });
      setSelectedOrg("");
      setCap("");
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setFeedback({
        tone: "error",
        message:
          err instanceof Error
            ? err.message
            : "Failed to add user to organization.",
      });
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-5">
      <h3 className="font-display text-lg font-semibold">
        Attach to organization
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Add this user as a member or viewer to an active organization workspace.
      </p>

      {feedback ? (
        <p
          role="status"
          className={`mt-3 rounded-xl border px-3 py-2 text-xs font-semibold ${
            feedback.tone === "error"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-success/30 bg-success/10 text-success"
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

      <form onSubmit={handleAttach} className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label
            htmlFor="attach-org-select"
            className="mb-1 block text-xs font-semibold"
          >
            Organization
          </label>
          <select
            id="attach-org-select"
            value={selectedOrg}
            required
            disabled={pending}
            onChange={(e) => setSelectedOrg(e.target.value)}
            className="min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="">Select an organization…</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name} ({org.slug})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="attach-role-select"
            className="mb-1 block text-xs font-semibold"
          >
            Role
          </label>
          <select
            id="attach-role-select"
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
            htmlFor="attach-cap-input"
            className="mb-1 block text-xs font-semibold"
          >
            Monthly credit cap (optional)
          </label>
          <input
            id="attach-cap-input"
            value={cap}
            inputMode="numeric"
            pattern="[0-9]*"
            disabled={pending || role === "ORGANIZATION_VIEWER"}
            placeholder="Unlimited"
            onChange={(e) => setCap(e.target.value)}
            className="min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
          />
        </div>

        <div className="sm:col-span-3">
          <Button
            type="submit"
            disabled={pending || !selectedOrg}
            className="min-h-10"
          >
            {pending ? "Adding…" : "Add membership"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function RemoveMembershipButton({
  organizationId,
  membershipId,
  isOwner,
  canManage,
}: {
  organizationId: string;
  membershipId: string;
  isOwner: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!canManage) return null;

  if (isOwner) {
    return (
      <span
        title="Transfer organization ownership before removing this user."
        className="inline-block cursor-not-allowed text-xs text-muted-foreground"
      >
        Owner (cannot remove)
      </span>
    );
  }

  return (
    <ConfirmDialog
      triggerLabel="Remove"
      title="Remove organization membership?"
      description="The user will lose access to this organization workspace. Their assets and history are preserved."
      confirmLabel="Remove membership"
      destructive
      disabled={pending}
      onConfirm={async () => {
        const res = await fetch(
          `/api/organizations/${organizationId}/members/${membershipId}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? "Failed to remove membership.");
        }
        startTransition(() => router.refresh());
      }}
    />
  );
}
