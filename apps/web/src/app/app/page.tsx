import { db } from "@aiwa/db";
import { redirect } from "next/navigation";

import { requireRequestSession } from "@/lib/request-auth";

export default async function WorkspaceEntryPage() {
  const session = await requireRequestSession("/app");
  const membership = await db.membership.findFirst({
    where: {
      userId: session.user.id,
      organization: {
        status: "ACTIVE",
        ...(session.session.activeOrganizationId
          ? { id: session.session.activeOrganizationId }
          : {}),
      },
    },
    select: { organization: { select: { slug: true } } },
  });

  if (membership) {
    redirect(`/app/${membership.organization.slug}`);
  }

  const fallback = await db.membership.findFirst({
    where: {
      userId: session.user.id,
      organization: { status: "ACTIVE" },
    },
    select: { organization: { select: { slug: true } } },
    orderBy: { createdAt: "asc" },
  });

  redirect(fallback ? `/app/${fallback.organization.slug}` : "/onboarding");
}
