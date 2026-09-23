import { db } from "@aiwa/db";
import {
  MAX_ORGANIZATION_NON_OWNER_MEMBERS,
  normalizeMemberEmail,
} from "@aiwa/organizations";
import Link from "next/link";
import type { Route } from "next";
import { AcceptInvitationButton } from "@/components/organizations/accept-invitation-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Brand } from "@/components/ui/brand";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/creative";
import { getRequestSession } from "@/lib/request-auth";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await getRequestSession();

  const invitation = await db.organizationInvitation.findUnique({
    where: { token },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          _count: {
            select: {
              memberships: {
                where: { role: { not: "ORGANIZATION_OWNER" } },
              },
            },
          },
        },
      },
      createdBy: { select: { name: true, email: true } },
    },
  });

  if (!invitation) {
    return (
      <InviteShell>
        <div className="text-center">
          <Eyebrow>Invitation</Eyebrow>
          <h1 className="font-display mt-3 text-2xl font-semibold">
            Invitation not found
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This invitation link is invalid or may have been removed.
          </p>
          <div className="mt-6">
            <Button asChild variant="secondary" className="min-h-10">
              <Link href={"/app" as Route}>Go to workspace</Link>
            </Button>
          </div>
        </div>
      </InviteShell>
    );
  }

  const isExpired =
    invitation.status === "EXPIRED" ||
    // eslint-disable-next-line react-hooks/purity
    invitation.expiresAt.getTime() < Date.now();
  const isRevoked = invitation.status === "REVOKED";
  const isAccepted = invitation.status === "ACCEPTED";
  const isOrgSuspended = invitation.organization.status !== "ACTIVE";
  const isFull =
    invitation.organization._count.memberships >=
    MAX_ORGANIZATION_NON_OWNER_MEMBERS;

  if (isExpired || isRevoked || isAccepted || isOrgSuspended) {
    const message = isOrgSuspended
      ? "This organization is currently suspended."
      : isAccepted
        ? "This invitation has already been accepted."
        : isRevoked
          ? "This invitation was revoked by the organization owner."
          : "This invitation link has expired.";

    return (
      <InviteShell>
        <div className="text-center">
          <Eyebrow>Invitation</Eyebrow>
          <h1 className="font-display mt-3 text-2xl font-semibold">
            Invitation no longer valid
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          <div className="mt-6">
            <Button asChild variant="secondary" className="min-h-10">
              <Link href={"/app" as Route}>Go to workspace</Link>
            </Button>
          </div>
        </div>
      </InviteShell>
    );
  }

  const roleLabel =
    invitation.role === "ORGANIZATION_MEMBER" ? "Member" : "Viewer";

  // Check if current authenticated user is already a member
  const existingMembership = session
    ? await db.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: session.user.id,
          },
        },
      })
    : null;

  const emailMismatch =
    session &&
    invitation.email &&
    normalizeMemberEmail(session.user.email) !==
      normalizeMemberEmail(invitation.email);

  const emailUnverified =
    session && Boolean(invitation.email) && !session.user.emailVerified;

  return (
    <InviteShell>
      <div>
        <Eyebrow>Team invitation</Eyebrow>
        <h1 className="font-display mt-3 text-2xl font-semibold sm:text-3xl">
          Join {invitation.organization.name}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          <strong>{invitation.createdBy.name}</strong> invited you to
          collaborate as a <strong>{roleLabel}</strong> in the{" "}
          <strong>{invitation.organization.name}</strong> workspace.
        </p>

        {invitation.email ? (
          <div className="mt-4 rounded-xl border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
            Invitation locked to:{" "}
            <span className="font-mono font-medium text-foreground">
              {invitation.email}
            </span>
          </div>
        ) : null}

        <div className="mt-6 border-t border-border pt-6">
          {!session ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Sign in to your account or register to accept this invitation.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild className="min-h-11 flex-1">
                  <Link
                    href={
                      `/sign-in?returnTo=${encodeURIComponent(`/invite/${token}`)}` as Route
                    }
                  >
                    Sign in to accept
                  </Link>
                </Button>
                <Button asChild variant="secondary" className="min-h-11 flex-1">
                  <Link
                    href={
                      `/sign-up?returnTo=${encodeURIComponent(`/invite/${token}`)}` as Route
                    }
                  >
                    Create account
                  </Link>
                </Button>
              </div>
            </div>
          ) : existingMembership ? (
            <div className="space-y-3">
              <p className="rounded-xl border border-success/30 bg-success/10 p-3 text-xs font-semibold text-success">
                You are already a member of this workspace.
              </p>
              <Button asChild className="min-h-11 w-full">
                <Link href={`/app/${invitation.organization.slug}` as Route}>
                  Open workspace
                </Link>
              </Button>
            </div>
          ) : emailMismatch ? (
            <div className="space-y-3">
              <p className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                This invitation is specifically for{" "}
                <strong>{invitation.email}</strong>. You are currently signed in
                as <strong>{session.user.email}</strong>. Please switch accounts
                to accept.
              </p>
              <Button asChild variant="secondary" className="min-h-11 w-full">
                <Link
                  href={
                    `/sign-in?returnTo=${encodeURIComponent(`/invite/${token}`)}` as Route
                  }
                >
                  Sign in with another account
                </Link>
              </Button>
            </div>
          ) : emailUnverified ? (
            <div className="space-y-3">
              <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                This invitation is specifically for{" "}
                <strong>{invitation.email}</strong>. You must verify ownership
                of this email address before you can accept workspace access.
              </p>
              <p className="text-xs text-muted-foreground">
                Please verify your email address to establish ownership before
                accepting.
              </p>
            </div>
          ) : isFull ? (
            <p className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              This organization has reached its seat limit (10 seats). Please
              contact the organization owner to free a seat.
            </p>
          ) : (
            <AcceptInvitationButton token={token} />
          )}
        </div>
      </div>
    </InviteShell>
  );
}

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex min-h-[72px] items-center justify-between border-b border-border bg-background/80 px-5 backdrop-blur-xl sm:px-8">
        <Brand />
        <ThemeToggle />
      </header>
      <div className="flex flex-1 items-center justify-center p-4 sm:p-7">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
