import Link from "next/link";
import { hasOrganizationPermission } from "@aiwa/authz";
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
  const canGenerate = hasOrganizationPermission(
    membership.role,
    "generation:create",
  );

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
        />
      </div>
    </main>
  );
}
