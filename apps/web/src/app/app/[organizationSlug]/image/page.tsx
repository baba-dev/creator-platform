import { redirect } from "next/navigation";
import { GenerationWorkspace } from "@/components/studio/generation-workspace";

export default async function ImagePage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ assetId?: string; tab?: string }>;
}) {
  const { organizationSlug } = await params;
  const { assetId, tab } = await searchParams;
  const editorTab =
    tab === "ai" || tab === "layers" || tab === "pixel" ? tab : null;

  if (assetId || editorTab) {
    const query = new URLSearchParams();
    if (assetId) query.set("assetId", assetId);
    if (editorTab) query.set("tab", editorTab);
    redirect(
      `/app/${encodeURIComponent(organizationSlug)}/image/precision?${query.toString()}`,
    );
  }

  return <GenerationWorkspace slug={organizationSlug} kind="image" />;
}
