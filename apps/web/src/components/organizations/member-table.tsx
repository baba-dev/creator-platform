"use client";

import { MEMBER_STORAGE_QUOTA_BYTES } from "@aiwa/organizations";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import { formatBinaryBytes } from "@/lib/format-bytes";

export type MemberRow = {
  id: string;
  userId: string;
  role: "ORGANIZATION_OWNER" | "ORGANIZATION_MEMBER" | "ORGANIZATION_VIEWER";
  monthlySpendingCapCredits: string | null;
  createdAt: string;
  user: { name: string; email: string };
  usedBytes: string;
};

type Feedback = { tone: "error" | "success"; message: string } | null;

export function MemberTable({
  members,
  organizationId,
  canManage = false,
  canTransfer = canManage,
}: {
  members: MemberRow[];
  organizationId: string;
  canManage?: boolean;
  canTransfer?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const owner = members.find((member) => member.role === "ORGANIZATION_OWNER");

  async function mutate(
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: object,
    success = "Team updated.",
  ) {
    setFeedback(null);
    const response = await fetch(path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok)
      throw new Error(result.error ?? "The team could not be updated.");
    setFeedback({ tone: "success", message: success });
    startTransition(() => router.refresh());
  }

  function run(operation: () => Promise<void>) {
    void operation().catch((error: unknown) =>
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The team could not be updated.",
      }),
    );
  }

  return (
    <section aria-busy={pending}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          1 owner + 9 member seats ·{" "}
          <span className="tabular-nums">{members.length} / 10 used</span>
        </p>
      </div>
      {canManage ? (
        <form
          className="mb-5 grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[minmax(180px,1fr)_180px_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            const formElement = event.currentTarget;
            const form = new FormData(formElement);
            run(async () => {
              await mutate(
                `/api/organizations/${organizationId}/members`,
                "POST",
                {
                  email: String(form.get("email")),
                  role: String(form.get("role")),
                },
                "Member added.",
              );
              formElement.reset();
            });
          }}
        >
          <div>
            <label
              htmlFor="member-email"
              className="mb-1 block text-xs font-semibold"
            >
              Registered user email
            </label>
            <input
              id="member-email"
              name="email"
              type="email"
              maxLength={254}
              required
              disabled={pending}
              className="min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="member-role"
              className="mb-1 block text-xs font-semibold"
            >
              Role
            </label>
            <select
              id="member-role"
              name="role"
              disabled={pending}
              className="min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="ORGANIZATION_MEMBER">Member</option>
              <option value="ORGANIZATION_VIEWER">Viewer</option>
            </select>
          </div>
          <Button disabled={pending} className="self-end">
            {pending ? "Saving…" : "Add member"}
          </Button>
        </form>
      ) : null}
      {feedback ? (
        <p
          role="status"
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${feedback.tone === "error" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-success/30 bg-success/10 text-success"}`}
        >
          {feedback.message}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              {[
                "User",
                "Role",
                "Monthly credit cap",
                "Storage used / 1 GiB",
                "Joined",
                "Actions",
              ].map((label) => (
                <th key={label} className="p-4">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.map((member) => {
              const isOwner = member.role === "ORGANIZATION_OWNER";
              return (
                <tr key={member.id}>
                  <td className="p-4 font-semibold">
                    {member.user.name}
                    <div className="font-normal text-muted-foreground">
                      {member.user.email}
                    </div>
                  </td>
                  <td className="p-4">
                    {isOwner ? (
                      "Owner"
                    ) : canManage ? (
                      <select
                        aria-label={`Role for ${member.user.name}`}
                        value={member.role}
                        disabled={pending}
                        onChange={(event) =>
                          run(() =>
                            mutate(
                              `/api/organizations/${organizationId}/members/${member.id}`,
                              "PATCH",
                              { role: event.target.value },
                              "Role updated.",
                            ),
                          )
                        }
                        className="min-h-10 rounded-xl border border-border bg-background px-3"
                      >
                        <option value="ORGANIZATION_MEMBER">Member</option>
                        <option value="ORGANIZATION_VIEWER">Viewer</option>
                      </select>
                    ) : (
                      member.role.replace("ORGANIZATION_", "")
                    )}
                  </td>
                  <td className="p-4 tabular-nums">
                    {isOwner ? (
                      "Owner — not editable"
                    ) : member.role === "ORGANIZATION_VIEWER" ? (
                      "Not applicable"
                    ) : canManage ? (
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const value = String(
                            new FormData(event.currentTarget).get("cap") ?? "",
                          ).trim();
                          run(() =>
                            mutate(
                              `/api/organizations/${organizationId}/members/${member.id}`,
                              "PATCH",
                              {
                                monthlySpendingCapCredits:
                                  value === "" ? null : value,
                              },
                              "Monthly credit cap updated.",
                            ),
                          );
                        }}
                      >
                        <input
                          aria-label={`Monthly credit cap for ${member.user.name}`}
                          name="cap"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          defaultValue={member.monthlySpendingCapCredits ?? ""}
                          placeholder="Unlimited"
                          disabled={pending}
                          className="min-h-10 w-32 rounded-xl border border-border bg-background px-3"
                        />
                        <Button variant="secondary" disabled={pending}>
                          Save
                        </Button>
                      </form>
                    ) : member.monthlySpendingCapCredits === null ? (
                      "Unlimited"
                    ) : (
                      BigInt(member.monthlySpendingCapCredits).toLocaleString()
                    )}
                  </td>
                  <td className="p-4 tabular-nums">
                    {formatBinaryBytes(BigInt(member.usedBytes))} /{" "}
                    {formatBinaryBytes(MEMBER_STORAGE_QUOTA_BYTES)}
                  </td>
                  <td className="p-4">
                    {new Date(member.createdAt).toLocaleDateString("en-OM")}
                  </td>
                  <td className="p-4">
                    {canManage && !isOwner ? (
                      <div className="flex gap-2">
                        <ConfirmDialog
                          triggerLabel="Remove"
                          destructive
                          title={`Remove ${member.user.name}?`}
                          description="Their account, assets, jobs, and organization history will be preserved. Their active organization sessions will be cleared."
                          confirmLabel="Remove membership"
                          disabled={pending}
                          onConfirm={() =>
                            mutate(
                              `/api/organizations/${organizationId}/members/${member.id}`,
                              "DELETE",
                              undefined,
                              "Member removed.",
                            ).catch((error: unknown) => {
                              setFeedback({
                                tone: "error",
                                message:
                                  error instanceof Error
                                    ? error.message
                                    : "Removal failed.",
                              });
                              throw error;
                            })
                          }
                        />
                        {canTransfer ? (
                          <ConfirmDialog
                            triggerLabel="Transfer"
                            title={`Transfer ownership to ${member.user.name}?`}
                            description={`${owner?.user.name ?? "The current owner"} will become a Member and ${member.user.name} will become the sole owner.`}
                            confirmLabel="Transfer ownership"
                            disabled={pending}
                            onConfirm={() =>
                              mutate(
                                `/api/organizations/${organizationId}/ownership`,
                                "POST",
                                { targetMembershipId: member.id },
                                "Ownership transferred.",
                              ).catch((error: unknown) => {
                                setFeedback({
                                  tone: "error",
                                  message:
                                    error instanceof Error
                                      ? error.message
                                      : "Transfer failed.",
                                });
                                throw error;
                              })
                            }
                          />
                        ) : null}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {members.length === 0 ? (
          <p className="p-10 text-center text-muted-foreground">
            No members found.
          </p>
        ) : null}
      </div>
    </section>
  );
}
