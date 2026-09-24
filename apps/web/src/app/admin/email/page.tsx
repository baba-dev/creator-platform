import { db } from "@aiwa/db";
import { StatusBadge } from "@/components/admin/primitives";
import { Eyebrow } from "@/components/ui/creative";
import { requirePlatformPermission } from "@/lib/request-auth";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "••••";
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}••••@${domain}`;
}

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "SENT") return "success";
  if (status === "FAILED") return "danger";
  if (status === "RETRY" || status === "SENDING") return "warning";
  return "neutral";
}

export default async function AdminEmailPage() {
  await requirePlatformPermission("audit:read");

  const [pending, retrying, failed, sent, recent] = await Promise.all([
    db.mailMessage.count({ where: { status: { in: ["PENDING", "QUEUED", "SENDING"] } } }),
    db.mailMessage.count({ where: { status: "RETRY" } }),
    db.mailMessage.count({ where: { status: "FAILED" } }),
    db.mailMessage.count({ where: { status: "SENT" } }),
    db.mailMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        kind: true,
        priority: true,
        status: true,
        template: true,
        recipient: true,
        attemptCount: true,
        lastErrorCode: true,
        lastErrorMessage: true,
        createdAt: true,
        sentAt: true,
        nextAttemptAt: true,
      },
    }),
  ]);

  const cards = [
    ["Queued", pending],
    ["Retrying", retrying],
    ["Failed", failed],
    ["Sent", sent],
  ] as const;

  return (
    <div className="px-4 py-7 sm:px-7 lg:px-9 lg:py-9">
      <Eyebrow>Operations</Eyebrow>
      <div className="mt-3">
        <h1 className="font-display text-4xl font-semibold tracking-tight">
          Email delivery
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Durable transactional-mail outbox and delivery diagnostics. Security
          content is never displayed here.
        </p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 font-display text-3xl font-semibold tabular-nums">
              {value.toLocaleString("en-US")}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <h2 className="font-display text-xl font-semibold">Recent deliveries</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Latest 50 messages. Recipients are masked and mail bodies are excluded.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead>
              <tr className="border-b border-border text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                <th className="px-5 py-3">Created</th>
                <th className="px-3 py-3">Recipient</th>
                <th className="px-3 py-3">Channel</th>
                <th className="px-3 py-3">Template</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-center">Attempts</th>
                <th className="px-3 py-3">Next / sent</th>
                <th className="px-5 py-3">Last error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recent.map((mail) => (
                <tr key={mail.id} className="align-top text-xs">
                  <td className="px-5 py-4 font-mono text-[10px] text-muted-foreground">
                    {mail.createdAt.toLocaleString("en-OM")}
                  </td>
                  <td className="px-3 py-4 font-mono text-[10px]">
                    {maskEmail(mail.recipient)}
                  </td>
                  <td className="px-3 py-4">
                    <span className="rounded-lg border border-border bg-muted/60 px-2 py-1 font-mono text-[10px]">
                      {mail.kind}
                    </span>
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      {mail.priority}
                    </span>
                  </td>
                  <td className="px-3 py-4 font-mono text-[10px] text-muted-foreground">
                    {mail.template}
                  </td>
                  <td className="px-3 py-4">
                    <StatusBadge tone={statusTone(mail.status)}>
                      {mail.status}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-4 text-center font-mono tabular-nums">
                    {mail.attemptCount}
                  </td>
                  <td className="px-3 py-4 font-mono text-[10px] text-muted-foreground">
                    {(mail.sentAt ?? mail.nextAttemptAt)?.toLocaleString("en-OM") ?? "—"}
                  </td>
                  <td className="max-w-72 px-5 py-4 text-[10px] text-muted-foreground">
                    {mail.lastErrorCode ? (
                      <>
                        <span className="font-mono font-semibold text-foreground">
                          {mail.lastErrorCode}
                        </span>
                        {mail.lastErrorMessage ? (
                          <span className="mt-1 block line-clamp-2">
                            {mail.lastErrorMessage}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    No transactional mail has been queued yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
