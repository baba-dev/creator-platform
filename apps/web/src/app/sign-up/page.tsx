import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { getRequestSession } from "@/lib/request-auth";

export default async function SignUpPage() {
  const session = await getRequestSession();

  if (session) {
    redirect("/app");
  }

  return (
    <AuthCard
      eyebrow="Email signup"
      title="Create your workspace"
      description="Start with an email and password. Your account will be isolated inside its organization."
      footerText="Already have an account?"
      footerHref="/sign-in"
      footerLabel="Sign in"
    >
      <SignUpForm />
    </AuthCard>
  );
}
