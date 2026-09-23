import type { Route } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { safeInvitationRoute } from "@/lib/navigation";
import { getRequestSession } from "@/lib/request-auth";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo: rawReturnTo } = await searchParams;
  const returnTo = safeInvitationRoute(rawReturnTo);
  const session = await getRequestSession();

  if (session) {
    redirect(returnTo === "/onboarding" ? "/app" : returnTo);
  }

  const isInvite = returnTo.startsWith("/invite/");

  return (
    <AuthCard
      eyebrow={isInvite ? "Workspace invitation" : "Email signup"}
      title={isInvite ? "Join your workspace" : "Create your workspace"}
      description={
        isInvite
          ? "Create an account with your work email to accept your invitation."
          : "Start with an email and password. Your account will be isolated inside its organization."
      }
      footerText="Already have an account?"
      footerHref={
        returnTo !== "/onboarding"
          ? (`/sign-in?returnTo=${encodeURIComponent(returnTo)}` as Route)
          : "/sign-in"
      }
      footerLabel="Sign in"
    >
      <SignUpForm returnTo={returnTo} />
    </AuthCard>
  );
}
