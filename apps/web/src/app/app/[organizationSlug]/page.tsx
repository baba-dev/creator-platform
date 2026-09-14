import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { OrganizationSwitcher } from "@/components/organizations/organization-switcher";
import { Button } from "@/components/ui/button";
import { requireOrganizationPermission } from "@/lib/request-auth";

const mediaTools = [
  ["Image Lab", "Generate, edit and upscale campaign visuals", "◈"],
  ["Video Studio", "Plan scenes and track long-running generations", "▶"],
  ["Voice Room", "Create English and Arabic narration", "∿"],
] as const;

function roleLabel(role: string): string {
  return role
    .replace("ORGANIZATION_", "")
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase());
}

export default async function OrganizationWorkspacePage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const { session, membership } = await requireOrganizationPermission(
    organizationSlug,
    "workspace:view",
  );
  const organizations = await db.membership.findMany({
    where: {
      userId: session.user.id,
      organization: { status: "ACTIVE" },
    },
    select: {
      organization: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const canAccessAdmin = hasPlatformPermission(
    session.user.platformRole,
    "platform:access",
  );
  const credits = membership.organization.wallet?.balanceCache ?? 0n;

  return (
    <main className="mx-auto min-h-screen max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <header className="flex min-h-20 flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-8">
          <Link href="/app" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-cyan-300 font-black text-slate-950">
              A
            </span>
            <span>
              <span className="block text-sm font-bold tracking-wide text-white">
                AIWA CREATORS
              </span>
              <span className="block text-xs text-slate-500">
                Creative intelligence workspace
              </span>
            </span>
          </Link>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <OrganizationSwitcher
              activeOrganizationId={membership.organization.id}
              organizations={organizations.map(
                ({ organization }) => organization,
              )}
            />
            {canAccessAdmin ? (
              <Button asChild variant="secondary" size="sm">
                <Link href="/admin">Admin console</Link>
              </Button>
            ) : null}
            <SignOutButton />
          </div>
        </header>

        <div className="grid lg:grid-cols-[230px_1fr]">
          <aside className="border-b border-white/10 p-5 lg:border-r lg:border-b-0">
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="truncate text-sm font-semibold text-white">
                {membership.organization.name}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {roleLabel(membership.role)} access
              </p>
            </div>

            <nav className="mt-5 grid grid-cols-2 gap-1 lg:block lg:space-y-1">
              {["Create", "Projects", "Assets", "Usage"].map((item, index) => (
                <span
                  key={item}
                  className={`block rounded-xl px-3 py-2.5 text-sm ${
                    index === 0
                      ? "bg-white/[0.08] font-medium text-white"
                      : "text-slate-500"
                  }`}
                >
                  {item}
                </span>
              ))}
            </nav>

            <div className="mt-6 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.055] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
                Credit balance
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {credits.toLocaleString("en-US")}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Assigned by platform finance
              </p>
            </div>
          </aside>

          <section className="p-5 sm:p-8 lg:p-10">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">
                  Organization workspace
                </p>
                <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white">
                  What will we make today?
                </h1>
                <p className="mt-3 text-sm text-slate-400">
                  Signed in as {session.user.email}
                </p>
              </div>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                Organization protected
              </span>
            </div>

            <div className="mt-9 grid gap-4 xl:grid-cols-3">
              {mediaTools.map(([title, description, glyph]) => (
                <article
                  key={title}
                  className="min-h-64 rounded-3xl border border-white/10 bg-white/[0.035] p-6"
                >
                  <span className="grid size-12 place-items-center rounded-2xl border border-white/15 bg-slate-950/60 text-xl text-white">
                    {glyph}
                  </span>
                  <h2 className="mt-8 text-2xl font-semibold text-white">
                    {title}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {description}
                  </p>
                  <p className="mt-6 text-sm font-semibold text-slate-600">
                    Model catalog coming next
                  </p>
                </article>
              ))}
            </div>

            <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.025] p-6">
              <div className="grid gap-5 md:grid-cols-3">
                {[
                  ["Session", "7-day secure database session"],
                  ["Scope", membership.organization.name],
                  ["Role", roleLabel(membership.role)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">
                      {label}
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-300">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
