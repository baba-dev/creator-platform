import Link from "next/link";
import { hasOrganizationPermission } from "@aiwa/authz";
import { requireOrganizationPermission } from "@/lib/request-auth";
import { Eyebrow } from "@/components/ui/creative";
import { Icon } from "@/components/ui/icon";
import {
  SeedAudioStudio,
  type SeedAudioInitialTake,
} from "@/components/studio/seed-audio-studio";
import { getCustomerJob } from "@/lib/generation-history";

export default async function AudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ sourceJobId?: string }>;
}) {
  const { organizationSlug } = await params;
  const query = await searchParams;
  const { membership, session } = await requireOrganizationPermission(
    organizationSlug,
    "workspace:view",
  );
  const canGenerate = hasOrganizationPermission(
    membership.role,
    "generation:create",
  );

  let initialTake: SeedAudioInitialTake | null = null;
  if (query.sourceJobId) {
    const source = await getCustomerJob(
      query.sourceJobId,
      membership.organizationId,
      session.user.id,
    );
    const request =
      source?.request &&
      typeof source.request === "object" &&
      !Array.isArray(source.request)
        ? (source.request as Record<string, unknown>)
        : {};
    const formats = ["wav", "mp3", "pcm", "ogg_opus"] as const;
    const sampleRates = [8000, 16000, 24000, 32000, 44100, 48000] as const;
    const workflows = ["CREATE", "MATCH", "IMAGE", "LONG"] as const;
    const languages = [
      "auto",
      "English",
      "Chinese",
      "Japanese",
      "Korean",
      "Spanish",
      "German",
      "Portuguese",
      "French",
      "Thai",
      "Vietnamese",
      "Indonesian",
      "Malay",
      "Filipino",
      "Italian",
      "Russian",
      "Dutch",
      "Polish",
      "Turkish",
      "Swedish",
    ] as const;
    const workflow =
      typeof request.workflow === "string" &&
      workflows.includes(request.workflow as (typeof workflows)[number])
        ? (request.workflow as (typeof workflows)[number])
        : request.longForm === true
          ? "LONG"
          : "CREATE";
    const format =
      typeof request.format === "string" &&
      formats.includes(request.format as (typeof formats)[number])
        ? (request.format as (typeof formats)[number])
        : "mp3";
    const sampleRate =
      typeof request.sampleRate === "number" &&
      sampleRates.includes(request.sampleRate as (typeof sampleRates)[number])
        ? (request.sampleRate as (typeof sampleRates)[number])
        : 44100;
    const language =
      typeof request.language === "string" &&
      languages.includes(request.language as (typeof languages)[number])
        ? (request.language as (typeof languages)[number])
        : "auto";
    if (
      source?.providerModelKey === "seed-audio-1.0" &&
      request.task === "seed-audio"
    ) {
      initialTake = {
        sourceText:
          typeof request.sourceText === "string"
            ? request.sourceText
            : typeof request.textPrompt === "string"
              ? request.textPrompt
              : "",
        workflow,
        duration:
          typeof request.estimatedDurationSeconds === "number"
            ? Math.max(
                1,
                Math.min(
                  workflow === "LONG" ? 300 : 120,
                  Math.round(request.estimatedDurationSeconds),
                ),
              )
            : workflow === "LONG"
              ? 120
              : 30,
        speechRate:
          typeof request.speechRate === "number" ? request.speechRate : 1,
        loudnessRate:
          typeof request.loudnessRate === "number" ? request.loudnessRate : 1,
        pitch: typeof request.pitch === "number" ? request.pitch : 0,
        subtitles: request.enableSubtitles !== false,
        language,
        directorPreset:
          typeof request.directorPreset === "string"
            ? request.directorPreset
            : "documentary",
        format,
        sampleRate,
        referenceAudioAssetIds: Array.isArray(request.referenceAudioAssetIds)
          ? request.referenceAudioAssetIds.filter(
              (id): id is string => typeof id === "string",
            )
          : [],
        referenceVoiceKeys: Array.isArray(request.referenceVoiceKeys)
          ? request.referenceVoiceKeys.filter(
              (key): key is string => typeof key === "string",
            )
          : [],
        referenceImageAssetId:
          typeof request.referenceImageAssetId === "string"
            ? request.referenceImageAssetId
            : "",
        parentGenerationId: source.parentGenerationId ?? source.id,
      };
    }
  }

  return (
    <main className="relative min-h-screen min-w-0 bg-background px-4 py-7 text-foreground sm:px-7 lg:px-9 lg:py-10">
      <div className="creative-glow pointer-events-none absolute inset-0" />
      <div className="relative mx-auto w-full max-w-7xl space-y-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <Eyebrow>Seed Audio / advanced voiceover</Eyebrow>
            <div className="mt-3 flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Icon name="sparkles" className="size-5" />
              </span>
              <div>
                <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                  Audio Generation
                </h1>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Seed Audio 1.0
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Direct a performance from text, match supplied voice references,
              use a visual reference, or build a long-form voiceover. Finished
              audio stays inside your private asset library.
            </p>
          </div>
          <Link
            href={`/app/${organizationSlug}/assets`}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-xs transition hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Icon name="assets" className="size-4" />
            Open asset library
          </Link>
        </div>
        <SeedAudioStudio
          organizationId={membership.organizationId}
          organizationSlug={organizationSlug}
          canGenerate={canGenerate}
          initialTake={initialTake}
        />
      </div>
    </main>
  );
}
