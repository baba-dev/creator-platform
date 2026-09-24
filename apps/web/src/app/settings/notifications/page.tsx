import { db } from "@aiwa/db";
import Link from "next/link";
import { NotificationPreferencesForm } from "@/components/settings/notification-preferences-form";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/creative";
import { requireRequestSession } from "@/lib/request-auth";

export default async function NotificationSettingsPage() {
  const session = await requireRequestSession("/settings/notifications");
  const preference = await db.notificationPreference.findUnique({
    where: { userId: session.user.id },
    select: {
      generationCompleted: true,
      generationFailed: true,
      reports: true,
    },
  });

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-8 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <Eyebrow>Preferences</Eyebrow>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-semibold tracking-tight">
              Email notifications
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Choose which routine Creator Platform messages arrive by email.
            </p>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link href="/app">Back to workspace</Link>
          </Button>
        </div>

        <div className="mt-6 rounded-2xl border border-warning/20 bg-warning/[0.06] p-5">
          <p className="text-sm font-semibold">
            Security messages always stay on
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Email verification, password and MFA changes, billing events, and
            team membership notices cannot be disabled because they protect the
            account and workspace.
          </p>
        </div>

        <div className="mt-6">
          <NotificationPreferencesForm
            initial={
              preference ?? {
                generationCompleted: true,
                generationFailed: true,
                reports: true,
              }
            }
          />
        </div>
      </div>
    </main>
  );
}
