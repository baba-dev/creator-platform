import Link from "next/link";
import { TotpEnrollment } from "@/components/auth/totp-enrollment";
import { TotpSecurityPanel } from "@/components/auth/totp-security-panel";
import { requireRequestSession } from "@/lib/request-auth";

export default async function SecurityPage() {
  // This is a narrowly scoped enrollment escape hatch for verified admins
  // who cannot yet pass the required MFA gate.
  const session = await requireRequestSession("/settings/security", { allowAdminWithoutMfa: true });
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-8 lg:py-12">
      <div className="mx-auto max-w-2xl">
        <Link href="/app" className="text-sm font-semibold text-primary hover:underline">← Back to workspace</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[.2em] text-primary">Account security</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">Two-factor authentication</h1>
        <p className="mb-7 mt-2 text-sm leading-6 text-muted-foreground">Manage the authenticator for your own verified Creators account.</p>
        {session.user.twoFactorEnabled
          ? <TotpSecurityPanel />
          : <TotpEnrollment accountEmail={session.user.email} administrative={session.user.platformRole !== "USER"} />}
      </div>
    </main>
  );
}
