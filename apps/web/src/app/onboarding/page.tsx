import { db } from "@aiwa/db";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { OnboardingForm } from "@/components/organizations/onboarding-form";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Brand } from "@/components/ui/brand";
import { Annotation, Eyebrow } from "@/components/ui/creative";
import { Icon, type IconName } from "@/components/ui/icon";
import { PencilArrow, Tape } from "@/components/ui/sketch";
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
    <main className="relative min-h-screen overflow-hidden bg-background px-4 py-6 sm:px-6 sm:py-10">
      <div className="creative-glow pointer-events-none absolute inset-0" />
      <div className="paper-grid pointer-events-none absolute inset-0 opacity-45 [mask-image:radial-gradient(circle_at_center,black,transparent_75%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col">
        <header className="flex items-center justify-between">
          <Brand />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </header>

        <div className="my-auto grid gap-10 py-12 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
          <section className="relative max-w-xl">
            <div className="flex items-center gap-3">
              <span className="font-hand grid size-11 place-items-center rounded-full border border-primary/25 bg-primary/10 text-xl font-bold text-primary">
                02
              </span>
              <div className="h-px flex-1 bg-border" />
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-subtle-foreground">
                Account → Workspace
              </span>
            </div>
            <Eyebrow className="mt-10 text-info">Final signup step</Eyebrow>
            <h1 className="font-display mt-4 text-5xl font-semibold leading-[1.02] tracking-[-0.05em] text-foreground sm:text-6xl">
              Give your creative space a name.
            </h1>
            <p className="mt-5 max-w-lg text-sm leading-7 text-muted-foreground sm:text-base">
              This becomes the secure home for your people, projects, generated
              assets, usage, and credits. You will begin as its owner.
            </p>
            <div className="relative mt-8 hidden w-fit -rotate-2 rounded-xl border border-border bg-card px-5 py-3 shadow-sketch lg:block">
              <Tape className="-top-2 left-10 h-4 w-16" />
              <Annotation className="text-xl text-foreground">
                Make it feel like yours ✦
              </Annotation>
              <PencilArrow className="absolute -right-24 -top-3 h-14 w-20 -rotate-12" />
            </div>
          </section>

          <section className="paper-sheet relative rounded-[30px] p-6 sm:p-9 lg:p-11">
            <div className="paper-dots pointer-events-none absolute inset-0 rounded-[30px] opacity-45" />
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                    Workspace details
                  </p>
                  <h2 className="font-display mt-2 text-3xl font-semibold tracking-[-0.035em] text-foreground">
                    Name your organization
                  </h2>
                </div>
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon name="projects" />
                </span>
              </div>

              <OnboardingForm />

              <div className="mt-8 grid gap-3 border-t border-border pt-6 sm:grid-cols-3">
                {(
                  [
                    ["Isolated", "Organization-scoped data", "projects"],
                    ["Controlled", "Role-based access", "admin"],
                    ["Funded", "Admin-issued credits", "credits"],
                  ] as const
                ).map(([title, detail, icon]) => (
                  <div
                    key={title}
                    className="rounded-xl border border-border bg-background/45 p-3"
                  >
                    <Icon
                      name={icon as IconName}
                      className="size-4 text-primary"
                    />
                    <p className="mt-3 text-xs font-bold text-foreground">
                      {title}
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                      {detail}
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
