import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getRequestSession } from "@/lib/request-auth";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const session = await getRequestSession();

  if (session) {
    redirect("/app");
  }

  const { token, error } = await searchParams;

  return (
    <AuthCard
      eyebrow="Account recovery"
      title="Set a new password"
      description="Choose a strong password with at least 12 characters to secure your workspace."
      footerText="Remembered your password?"
      footerHref="/sign-in"
      footerLabel="Sign in"
    >
      <ResetPasswordForm token={token} initialError={error} />
    </AuthCard>
  );
}
