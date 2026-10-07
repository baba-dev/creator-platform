import { redirect } from "next/navigation";
import { GenerationWorkspace } from "@/components/studio/generation-workspace";

export default async function VideoPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ assetId?: string; tab?: string }>;
}) {
  const { organizationSlug } = await params;
  const { assetId, tab } = await searchParams;

  if (assetId || tab === "editor") {
    const query = new URLSearchParams();
    if (assetId) query.set("assetId", assetId);
    redirect(
      `/app/${encodeURIComponent(organizationSlug)}/video/editor?${query.toString()}`,
    );
  }

  return <GenerationWorkspace slug={organizationSlug} kind="video" />;
}
