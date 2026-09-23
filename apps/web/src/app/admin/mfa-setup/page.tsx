import { AdminMfaGate } from "@/components/admin/admin-mfa-gate";
import { StatusBadge } from "@/components/admin/primitives";
import { Eyebrow } from "@/components/ui/creative";
import { requirePlatformPermission } from "@/lib/request-auth";

export default async function AdminMfaSetupPage() {
  const session = await requirePlatformPermission("platform:access");

  if (!session.user.twoFactorEnabled) {
    return <AdminMfaGate session={session} />;
  }

  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-xl rounded-3xl border border-border bg-card p-6 sm:p-8">
        <Eyebrow>Account security</Eyebrow>
        <h1 className="font-display mt-2 text-2xl font-semibold">
          Administrative Multi-Factor Authentication
        </h1>
        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs text-muted-foreground">MFA status:</span>
          <StatusBadge tone="success">Enrolled & Active</StatusBadge>
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Multi-factor authentication (TOTP) is currently active on your account
          for the <strong>{session.user.platformRole}</strong> role. You will be
          prompted for an authenticator code whenever signing in.
        </p>
      </div>
    </div>
  );
}
