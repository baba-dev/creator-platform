"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { VoiceCastingBooth } from "@/components/ui/voice-casting-booth";

export function VoiceCastingWorkspace({
  organizationId,
  organizationSlug,
}: {
  organizationId: string;
  organizationSlug: string;
}) {
  const router = useRouter();
  const speechRoute =
    `/app/${encodeURIComponent(organizationSlug)}/speech` as Route;

  return (
    <VoiceCastingBooth
      isOpen
      presentation="page"
      organizationId={organizationId}
      onClose={() => router.push(speechRoute)}
      onSelectVoice={(voiceKey, speechRate) => {
        const query = new URLSearchParams({
          voiceKey,
          speechRate: String(speechRate ?? 1),
        });
        router.push(`${speechRoute}?${query.toString()}` as Route);
      }}
    />
  );
}
