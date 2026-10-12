import { AdminMfaGate } from "@/components/admin/admin-mfa-gate";
import { TotpSecurityPanel } from "@/components/auth/totp-security-panel";
import { Eyebrow } from "@/components/ui/creative";
import { requirePlatformPermission } from "@/lib/request-auth";

export default async function AdminMfaSetupPage() {
  const session = await requirePlatformPermission("platform:access", {
    allowAdminWithoutMfa: true,
  });
  if (!session.user.twoFactorEnabled) return <AdminMfaGate session={session} />;
  return (
    <div className="mx-auto max-w-2xl p-4 py-10 sm:p-8">
      <Eyebrow>Account security</Eyebrow>
      <h1 className="font-display mb-5 mt-2 text-2xl font-semibold">Administrative Multi-Factor Authentication</h1>
      <TotpSecurityPanel />
    </div>
  );
}
