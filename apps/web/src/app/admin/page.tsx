import { getPlatformPermissions } from "@aiwa/authz";
import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import { requirePlatformPermission } from "@/lib/request-auth";

export default async function AdminPage() {
  const session = await requirePlatformPermission("platform:access");
  const permissions = getPlatformPermissions(session.user.platformRole);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-slate-950/70 px-6 py-5 backdrop-blur-xl">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">
            Platform operations
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white">
            Administration console
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/app">Customer workspace</Link>
          </Button>
          <SignOutButton />
        </div>
      </header>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Access boundary
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {session.user.platformRole.replaceAll("_", " ")}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
            Permissions are checked server-side on every protected page and API
            operation. UI visibility is only a convenience, never the security
            boundary.
          </p>

          <div className="mt-7 flex flex-wrap gap-2">
            {permissions.map((permission) => (
              <span
                key={permission}
                className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs font-medium text-slate-300"
              >
                {permission}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-amber-300/15 bg-amber-300/[0.05] p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
            Next admin milestone
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            Manual payments and credit grants
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Cash and cheque confirmation will require finance permission,
            idempotency, and an immutable ledger entry. General platform admins
            cannot perform those mutations.
          </p>
        </div>
      </section>
    </main>
  );
}
