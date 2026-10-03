import Link from "next/link";
import { hasOrganizationPermission } from "@aiwa/authz";
import { GenerationStudio } from "@/components/studio/generation-studio";
import { TranscriptionStudio } from "@/components/studio/transcription-studio";
import { ImageEditor } from "@/components/studio/image-editor";
import { VideoEditor } from "@/components/studio/video-editor";
import { Icon, type IconName } from "@/components/ui/icon";
import { Eyebrow } from "@/components/ui/creative";
import { requireOrganizationPermission } from "@/lib/request-auth";
import { getAvailableStudioModels } from "@/lib/studio-model-discovery";

const pages = {
  image: {
    title: "Image generation",
    description:
      "Turn a thought into something you can see. Choose the model, frame and finish, then keep the results in your library.",
    icon: "image",
    mode: "IMAGE",
    accent: "bg-primary/10 text-primary",
  },
  video: {
    title: "Video generation",
    description:
      "Compose your shot, set the format and duration, and follow each render from the first idea to the finished asset.",
    icon: "video",
    mode: "VIDEO",
    accent: "bg-info/10 text-info",
  },
  speech: {
    title: "Speech generation",
    description:
      "Give your writing a voice. Set the speaker and pace, then save the narration to your media library.",
    icon: "voice",
    mode: "VOICE",
    accent: "bg-accent/10 text-accent",
  },
} as const;

export async function GenerationWorkspace({
  slug,
  kind,
  initialAssetId,
}: {
  slug: string;
  kind: keyof typeof pages;
  initialAssetId?: string;
}) {
  const { membership } = await requireOrganizationPermission(
    slug,
    "workspace:view",
  );
  const page = pages[kind];
  const [promptEnhancement, transcription] = await Promise.all([
    kind === "speech"
      ? Promise.resolve(null)
      : getAvailableStudioModels("prompt-enhancement"),
    kind === "speech"
      ? getAvailableStudioModels("transcription")
      : Promise.resolve(null),
  ]);
  return (
    <main className="relative min-h-screen min-w-0 bg-background px-4 py-7 text-foreground sm:px-7 lg:px-9 lg:py-10">
      <div className="creative-glow pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-[1500px] space-y-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <Eyebrow>Creative tools / {kind}</Eyebrow>
            <div className="mt-3 flex items-center gap-3">
              <span
                className={`grid size-11 shrink-0 place-items-center rounded-2xl ${page.accent}`}
              >
                <Icon name={page.icon as IconName} className="size-5" />
              </span>
              <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                {page.title}
              </h1>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {page.description}
            </p>
          </div>
          <Link
            href={`/app/${slug}/assets`}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-xs hover:border-primary/40"
          >
            <Icon name="assets" className="size-4" /> Open asset library
          </Link>
        </div>
        <GenerationStudio
          key={kind}
          organizationId={membership.organizationId}
          organizationSlug={slug}
          canGenerate={hasOrganizationPermission(
            membership.role,
            "generation:create",
          )}
          initialMode={page.mode}
          variant="advanced"
          promptEnhancementModels={promptEnhancement?.models ?? []}
          promptEnhancementDefaultModelId={
            promptEnhancement?.defaultModelId ?? null
          }
        />
        {kind === "speech" ? (
          <TranscriptionStudio
            organizationId={membership.organizationId}
            canGenerate={hasOrganizationPermission(
              membership.role,
              "generation:create",
            )}
            canUpload={hasOrganizationPermission(
              membership.role,
              "assets:manage",
            )}
            models={transcription?.models ?? []}
            defaultModelId={transcription?.defaultModelId ?? null}
          />
        ) : null}
        {kind === "image" ? (
          <ImageEditor
            organizationId={membership.organizationId}
            organizationSlug={slug}
            initialAssetId={initialAssetId}
            canEdit={hasOrganizationPermission(
              membership.role,
              "assets:manage",
            )}
            canGenerate={hasOrganizationPermission(
              membership.role,
              "generation:create",
            )}
          />
        ) : null}
        {kind === "video" ? (
          <VideoEditor
            organizationId={membership.organizationId}
            initialAssetId={initialAssetId}
            canEdit={hasOrganizationPermission(
              membership.role,
              "assets:manage",
            )}
          />
        ) : null}
      </div>
    </main>
  );
}
