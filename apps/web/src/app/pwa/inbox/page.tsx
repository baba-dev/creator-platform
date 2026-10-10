import { db } from "@aiwa/db";
import { requireRequestSession } from "@/lib/request-auth";
import { PwaInbox } from "@/components/pwa/pwa-inbox";

export default async function InboxPage() {
  const session = await requireRequestSession("/pwa/inbox");
  const memberships = await db.membership.findMany({
    where: { userId: session.user.id, organization: { status: "ACTIVE" } },
    select: { organization: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });
  const workspaces = memberships.map(({ organization }) => organization);
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">Device integration</p>
        <h1 className="mt-3 font-display text-4xl font-semibold">Send to Creators</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Review incoming content and choose a workspace. Nothing is uploaded without your action.
        </p>
        <PwaInbox workspaces={workspaces} />
      </div>
    </main>
  );
}
