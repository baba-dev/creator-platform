import { db } from "@aiwa/db";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { OnboardingForm } from "@/components/organizations/onboarding-form";
import { requireRequestSession } from "@/lib/request-auth";

export default async function OnboardingPage() {
  const session = await requireRequestSession("/onboarding");
  const membership = await db.membership.findFirst({
    where: {
      userId: session.user.id,
      organization: { status: "ACTIVE" },
    },
    select: { organization: { select: { slug: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (membership) {
    redirect(`/app/${membership.organization.slug}`);
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-12 sm:px-6">
      <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-950/75 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-9">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">
              Final signup step
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white">
              Name your organization
            </h1>
          </div>
          <SignOutButton />
        </div>

        <p className="mt-4 max-w-lg text-sm leading-6 text-slate-400">
          This becomes the secure boundary for members, projects, generated
          assets, usage, and credits. You will start as the organization owner.
        </p>

        <OnboardingForm />

        <div className="mt-8 grid gap-3 border-t border-white/10 pt-6 sm:grid-cols-3">
          {[
            ["Isolated", "Data stays organization-scoped"],
            ["Controlled", "Role-based member access"],
            ["Funded", "Credits assigned by admin"],
          ].map(([title, detail]) => (
            <div key={title} className="rounded-xl bg-white/[0.035] p-3">
              <p className="text-sm font-semibold text-slate-200">{title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
