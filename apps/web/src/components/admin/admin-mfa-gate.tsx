"use client";

import { TotpEnrollment } from "@/components/auth/totp-enrollment";
import type { RequestSession } from "@/lib/request-auth";

export function AdminMfaGate({ session }: { session: RequestSession }) {
  return (
    <div className="mx-auto max-w-2xl p-4 py-10 sm:p-8">
      <TotpEnrollment accountEmail={session.user.email} administrative />
    </div>
  );
}
