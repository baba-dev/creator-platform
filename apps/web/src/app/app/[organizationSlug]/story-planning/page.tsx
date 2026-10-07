import type { Route } from "next";
import { redirect } from "next/navigation";

export default async function StoryPlanningRedirect({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  redirect(
    `/app/${encodeURIComponent(organizationSlug)}/brand-assistants?tab=story` as Route,
  );
}
