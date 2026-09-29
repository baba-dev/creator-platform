import { GenerationWorkspace } from "@/components/studio/generation-workspace";
export default async function ImagePage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ assetId?: string }>;
}) {
  const { organizationSlug } = await params;
  const { assetId } = await searchParams;
  return (
    <GenerationWorkspace
      slug={organizationSlug}
      kind="image"
      initialAssetId={assetId}
    />
  );
}
