import { auth } from "@/lib/auth";
import { safeInternalRoute } from "@/lib/navigation";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PendingVerification } from "@/components/auth/pending-verification";

export default async function PendingVerificationPage({ searchParams }: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const returnTo = safeInternalRoute((await searchParams).returnTo);
  // This is deliberately NOT getRequestSession: the only capability offered to
  // an unverified user here is requesting another verification message.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.disabledAt || session.user.platformRole !== "USER") {
    redirect("/sign-in");
  }
  if (session.user.emailVerified) redirect(returnTo);
  return <PendingVerification email={session.user.email} returnTo={returnTo} />;
}
