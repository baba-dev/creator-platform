import { GenerationWorkspace } from "@/components/studio/generation-workspace";

export default async function SpeechPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ voiceKey?: string; speechRate?: string }>;
}) {
  const { organizationSlug } = await params;
  const { voiceKey, speechRate } = await searchParams;
  const parsedRate = Number.parseFloat(speechRate ?? "");
  const initialSpeechRate =
    Number.isFinite(parsedRate) && parsedRate >= 0.5 && parsedRate <= 2
      ? parsedRate
      : undefined;
  const initialVoiceKey =
    voiceKey && /^[a-z0-9_-]{1,100}$/i.test(voiceKey) ? voiceKey : undefined;

  return (
    <GenerationWorkspace
      slug={organizationSlug}
      kind="speech"
      initialVoiceKey={initialVoiceKey}
      initialSpeechRate={initialSpeechRate}
    />
  );
}
