"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function PendingVerification({ email, returnTo }: { email: string; returnTo: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function resend() {
    setPending(true);
    try {
      const result = await authClient.sendVerificationEmail({ email, callbackURL: returnTo });
      setMessage(result.error ? "Please try again later. Verification requests are rate-limited." : "A new verification message has been requested.");
    } catch {
      setMessage("Delivery is currently unavailable. You can request another link later.");
    } finally { setPending(false); }
  }
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-12">
      <section className="paper-sheet w-full max-w-lg rounded-[28px] p-7 text-center sm:p-10">
        <svg className="mx-auto h-28 w-28 text-primary" role="img" aria-label="Email verification pending" viewBox="0 0 120 120" fill="none">
          <circle cx="60" cy="60" r="53" fill="currentColor" fillOpacity=".06"/>
          <rect x="25" y="38" width="70" height="49" rx="10" stroke="currentColor" strokeWidth="2.5"/>
          <path d="m26 43 34 25 34-25" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="88" cy="35" r="13" fill="currentColor"/><path d="m82 35 4 4 7-8" stroke="var(--background)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M15 21v8m-4-4h8m84 65v8m-4-4h8" stroke="currentColor" strokeOpacity=".4" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <p className="mt-5 font-mono text-[10px] font-bold uppercase tracking-[.16em] text-primary">One final step</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Confirm your email address</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">Your Creators account has been created. We need to confirm <strong className="text-foreground">{email}</strong> before granting workspace access. Mail delivery runs separately from signup.</p>
        <Button className="mt-7 w-full" type="button" disabled={pending} onClick={() => void resend()}>{pending ? "Requesting…" : "Resend verification email"}</Button>
        {message ? <p role="status" className="mt-4 text-xs text-muted-foreground">{message}</p> : null}
        <p className="mt-5 text-xs text-muted-foreground">Already verified in another tab? Refresh this page to continue.</p>
      </section>
    </main>
  );
}
