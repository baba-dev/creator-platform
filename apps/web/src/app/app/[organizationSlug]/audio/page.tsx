import { requireOrganizationPermission } from "@/lib/request-auth";
import { Eyebrow } from "@/components/ui/creative";
import { Icon } from "@/components/ui/icon";
import { SeedAudioStudio } from "@/components/studio/seed-audio-studio";

export default async function AudioPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const { membership } = await requireOrganizationPermission(
    organizationSlug,
    "workspace:view",
  );
  return (
    <main className="relative min-h-screen min-w-0 bg-background px-4 py-7 text-foreground sm:px-7 lg:px-9 lg:py-10">
      <div className="creative-glow pointer-events-none absolute inset-0" />
      <div className="relative mx-auto w-full max-w-7xl space-y-7">
        <div className="max-w-3xl">
          <Eyebrow>Audio generation / advanced voiceover</Eyebrow>
          <div className="mt-3 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Icon name="sparkles" className="size-5" />
            </span>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Seed Audio Studio
            </h1>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Direct your performance, match a supplied voice, or turn a visual
            reference into a narrated scene. Finished audio remains in your
            private asset library.
          </p>
        </div>
        <SeedAudioStudio organizationId={membership.organizationId} />
      </div>
    </main>
  );
}
