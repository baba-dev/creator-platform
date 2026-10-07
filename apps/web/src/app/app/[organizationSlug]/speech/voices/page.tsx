import { VoiceCastingWorkspace } from "@/components/studio/voice-casting-workspace";
import { requireOrganizationPermission } from "@/lib/request-auth";

export default async function VoiceCastingPage({
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
      <div className="relative w-full min-w-0">
        <VoiceCastingWorkspace
          organizationId={membership.organizationId}
          organizationSlug={organizationSlug}
        />
      </div>
    </main>
  );
}
