"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GENERATION_ACTIVITY_EVENT } from "@/lib/generation-activity";

/** Refresh only during an active generation or briefly after a new admission. */
export function RecentCreationsRefresh({ organizationId, active }: { organizationId: string; active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    let recentUntil = 0;
    const onStarted = (event: Event) => {
      const detail = (event as CustomEvent<{ organizationId?: string }>).detail;
      if (detail?.organizationId !== organizationId) return;
      recentUntil = Date.now() + 120_000;
      router.refresh();
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && (active || Date.now() < recentUntil)) router.refresh();
    }, 12_000);
    window.addEventListener(GENERATION_ACTIVITY_EVENT, onStarted);
    return () => { window.clearInterval(timer); window.removeEventListener(GENERATION_ACTIVITY_EVENT, onStarted); };
  }, [active, organizationId, router]);
  return null;
}
