import type { Route } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/sign-in-form";
import { safeInternalRoute } from "@/lib/navigation";
import { getRequestSession } from "@/lib/request-auth";
import { parseServerEnv } from "@aiwa/config";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; error?: string }>;
}) {
  const params = await searchParams;
  const returnTo = safeInternalRoute(params.returnTo);
  const linkingNeeded = params.error === "account_not_linked";
  const session = await getRequestSession();

  if (session) {
    redirect(returnTo);
  }

  return (
    <AuthCard
      eyebrow="Secure access"
      title="Welcome back"
      description="Sign in to your organization workspace to create media and monitor credits."
      footerText="New to Aiwa Creators?"
      footerHref={
        returnTo && returnTo !== "/app"
          ? (`/sign-up?returnTo=${encodeURIComponent(returnTo)}` as Route)
          : "/sign-up"
      }
      footerLabel="Create an account"
    >
      {linkingNeeded ? <p role="alert" className="mb-4 rounded-xl border border-border bg-muted/40 p-3 text-sm text-foreground">This provider is not linked to an existing Creators account. Sign in with your original method, then connect it from Connections &amp; Storage.</p> : null}
      <SignInForm
        returnTo={returnTo}
        googleEnabled={Boolean(
          parseServerEnv().GOOGLE_AUTH_CLIENT_ID &&
          parseServerEnv().GOOGLE_AUTH_CLIENT_SECRET,
        )}
        microsoftEnabled={Boolean(
          parseServerEnv().MICROSOFT_AUTH_CLIENT_ID &&
          parseServerEnv().MICROSOFT_AUTH_CLIENT_SECRET,
        )}
      />
    </AuthCard>
  );
}
