import { hasOrganizationPermission } from "@aiwa/authz";
import { TranscriptionStudio } from "@/components/studio/transcription-studio";
import { requireOrganizationPermission } from "@/lib/request-auth";
import { getAvailableStudioModels } from "@/lib/studio-model-discovery";

export default async function TranscriptionPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const { membership } = await requireOrganizationPermission(
    organizationSlug,
    "workspace:view",
  );
  const transcription = await getAvailableStudioModels("transcription");

  return (
    <main className="relative min-h-screen min-w-0 bg-background px-4 py-7 text-foreground sm:px-7 lg:px-9 lg:py-10">
      <div className="creative-glow pointer-events-none absolute inset-0" />
      <div className="relative w-full min-w-0">
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
          models={transcription.models}
          defaultModelId={transcription.defaultModelId}
        />
      </div>
    </main>
  );
}
