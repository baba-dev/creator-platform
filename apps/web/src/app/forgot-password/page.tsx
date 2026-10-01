import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getRequestSession } from "@/lib/request-auth";

export default async function ForgotPasswordPage() {
  const session = await getRequestSession();

  if (session) {
    redirect("/app");
  }

  return (
    <AuthCard
      eyebrow="Account recovery"
      title="Reset your password"
      description="Enter your work email address and we will send you a secure link to reset your password."
      footerText="Remembered your password?"
      footerHref="/sign-in"
      footerLabel="Sign in"
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
