import { GenerationWorkspace } from "@/components/studio/generation-workspace";
export default async function SpeechPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  return <GenerationWorkspace slug={organizationSlug} kind="speech" />;
}
