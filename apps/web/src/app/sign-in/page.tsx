import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/sign-in-form";
import { safeInternalRoute } from "@/lib/navigation";
import { getRequestSession } from "@/lib/request-auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const returnTo = safeInternalRoute((await searchParams).returnTo);
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
      footerHref="/sign-up"
      footerLabel="Create an account"
    >
      <SignInForm returnTo={returnTo} />
    </AuthCard>
  );
}
