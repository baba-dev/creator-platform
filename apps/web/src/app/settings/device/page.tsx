import { requireRequestSession } from "@/lib/request-auth";
import { DeviceSettings } from "@/components/pwa/device-settings";
import Link from "next/link";

export default async function DevicePage() {
  await requireRequestSession("/settings/device");
  return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-8 lg:py-12">
    <div className="mx-auto max-w-3xl">
      <Link href="/app" className="text-sm font-semibold text-primary hover:underline">← Back to workspace</Link>
      <p className="mt-8 text-xs font-semibold uppercase tracking-[.2em] text-primary">PWA 2.0</p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">App &amp; Device</h1>
      <p className="mt-2 mb-7 text-sm leading-6 text-muted-foreground">Installation, offline readiness and device permissions in one place.</p>
      <DeviceSettings />
    </div>
  </main>;
}
