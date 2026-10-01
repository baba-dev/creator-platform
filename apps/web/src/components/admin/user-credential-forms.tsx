"use client";

import { platformRoles, type PlatformRole } from "@aiwa/authz";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

type Feedback =
  | { tone: "success"; message: string }
  | { tone: "error"; message: string }
  | null;

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <p
      role="status"
      className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
        feedback.tone === "error"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-success/30 bg-success/10 text-success"
      }`}
    >
      {feedback.message}
    </p>
  );
}

export function AdminCreateUserForm({
  isPlatformOwner,
}: {
  isPlatformOwner: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [role, setRole] = useState<PlatformRole>("USER");
  const [emailVerified, setEmailVerified] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (password !== confirmPassword) {
      setFeedback({ tone: "error", message: "Passwords do not match." });
      return;
    }

    const payload = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password,
      role,
      emailVerified,
      verificationReason: emailVerified
        ? String(form.get("verificationReason") ?? "")
        : undefined,
    };

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        user?: { id: string };
      };

      if (!response.ok || !data.user?.id) {
        throw new Error(data.error ?? "Failed to create user.");
      }

      setFeedback({ tone: "success", message: "User created successfully." });
      startTransition(() => {
        router.push(`/admin/users/${data.user?.id}`);
        router.refresh();
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Failed to create user.",
      });
    }
  }

  const availableRoles = isPlatformOwner ? platformRoles : (["USER"] as const);

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-xs font-semibold">
          Full name
          <input
            name="name"
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
            className="mt-1 block min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring/35"
          />
        </label>

        <label className="text-xs font-semibold">
          Email address
          <input
            name="email"
            required
            type="email"
            maxLength={254}
            autoComplete="email"
            className="mt-1 block min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring/35"
          />
        </label>

        <label className="text-xs font-semibold">
          Temporary password
          <input
            name="password"
            required
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            className="mt-1 block min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring/35"
          />
          <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
            12–128 characters. The password is never displayed again.
          </span>
        </label>

        <label className="text-xs font-semibold">
          Confirm password
          <input
            name="confirmPassword"
            required
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            className="mt-1 block min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring/35"
          />
        </label>

        <label className="text-xs font-semibold">
          Platform role
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as PlatformRole)}
            className="mt-1 block min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring/35"
          >
            {availableRoles.map((item) => (
              <option key={item} value={item}>
                {item.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          {!isPlatformOwner ? (
            <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
              Only Platform Owners can provision privileged platform roles.
            </span>
          ) : null}
        </label>

        {isPlatformOwner ? (
          <div className="rounded-2xl border border-border bg-muted/30 p-4">
            <label className="flex items-start gap-3 text-xs font-semibold">
              <input
                type="checkbox"
                checked={emailVerified}
                onChange={(event) => setEmailVerified(event.target.checked)}
                className="mt-0.5 size-4"
              />
              <span>
                Mark email as administratively verified
                <span className="mt-1 block text-[10px] font-normal leading-4 text-muted-foreground">
                  Use only when mailbox ownership has been verified outside the
                  normal email-verification flow.
                </span>
              </span>
            </label>
          </div>
        ) : null}
      </div>

      {isPlatformOwner && emailVerified ? (
        <label className="mt-5 block text-xs font-semibold">
          Verification audit reason
          <textarea
            name="verificationReason"
            required
            minLength={8}
            maxLength={500}
            rows={3}
            placeholder="How mailbox ownership was verified"
            className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring/35"
          />
        </label>
      ) : null}

      <div className="mt-5">
        <FeedbackMessage feedback={feedback} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} className="min-h-11">
          {pending ? "Creating user…" : "Create user"}
        </Button>
        <p className="text-[10px] leading-4 text-muted-foreground">
          Unverified users must verify their email before a session can be
          created. No organization membership is added automatically.
        </p>
      </div>
    </form>
  );
}

export function UserPasswordResetForm({
  userId,
  userName,
  targetRole,
  canManage,
  isPlatformOwner,
}: {
  userId: string;
  userName: string;
  targetRole: PlatformRole;
  canManage: boolean;
  isPlatformOwner: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const allowed = canManage && (targetRole === "USER" || isPlatformOwner);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allowed) return;
    setFeedback(null);

    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    const confirmPassword = String(data.get("confirmPassword") ?? "");

    if (password !== confirmPassword) {
      setFeedback({ tone: "error", message: "Passwords do not match." });
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        revokedSessions?: number;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to reset password.");
      }

      form.reset();
      setFeedback({
        tone: "success",
        message: `Password reset. ${body.revokedSessions ?? 0} active session(s) revoked.`,
      });
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Failed to reset password.",
      });
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-display text-lg font-semibold">Reset password</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Set a new credential password for {userName}. A successful reset revokes
        every active session. Existing MFA enrollment and recovery codes are
        preserved.
      </p>

      {!allowed ? (
        <p className="mt-4 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Only a Platform Owner can reset the password of a privileged platform
          account.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label className="block text-xs font-semibold">
            New password
            <input
              name="password"
              required
              type="password"
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              className="mt-1 block min-h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring/35"
            />
          </label>
          <label className="block text-xs font-semibold">
            Confirm new password
            <input
              name="confirmPassword"
              required
              type="password"
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              className="mt-1 block min-h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring/35"
            />
          </label>
          <FeedbackMessage feedback={feedback} />
          <Button type="submit" disabled={pending} className="min-h-10">
            {pending ? "Resetting…" : "Reset password & revoke sessions"}
          </Button>
        </form>
      )}
    </section>
  );
}
