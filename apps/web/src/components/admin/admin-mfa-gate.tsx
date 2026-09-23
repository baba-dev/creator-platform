"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/creative";
import { authClient } from "@/lib/auth-client";
import type { RequestSession } from "@/lib/request-auth";

const inputClassName = "form-control mt-2 text-sm";

export function AdminMfaGate({ session }: { session: RequestSession }) {
  const router = useRouter();
  const [step, setStep] = useState<"intro" | "setup" | "done">("intro");
  const [password, setPassword] = useState("");
  const [totpURI, setTotpURI] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  async function handleStartSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const result = await authClient.twoFactor.enable({
        password,
      });

      if (result.error) {
        setError(
          result.error.message ??
            "Could not initiate MFA setup. Check your password.",
        );
        setPending(false);
        return;
      }

      const data = result.data as { totpURI?: string; backupCodes?: string[] };
      setTotpURI(data.totpURI ?? null);
      setBackupCodes(data.backupCodes ?? []);
      setStep("setup");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to begin MFA setup.",
      );
    } finally {
      setPending(false);
    }
  }

  async function handleVerifyTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const result = await authClient.twoFactor.verifyTotp({
        code: verificationCode.trim(),
      });

      if (result.error) {
        setError(
          "Invalid code. Please enter the current 6-digit code from your app.",
        );
        setPending(false);
        return;
      }

      setStep("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify code.");
    } finally {
      setPending(false);
    }
  }

  function copyBackupCodes() {
    void navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <Eyebrow>Security requirement</Eyebrow>
        <h1 className="font-display mt-2 text-2xl font-semibold">
          Administrative Multi-Factor Authentication
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account holds the <strong>{session.user.platformRole}</strong>{" "}
          role. Production policy requires all administrative accounts to have
          multi-factor authentication (MFA) enabled before accessing the admin
          portal.
        </p>

        {error ? (
          <div
            className="mt-4 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {step === "intro" && (
          <form className="mt-6 space-y-4" onSubmit={handleStartSetup}>
            <label className="block text-xs font-bold text-foreground/90">
              Confirm your account password to begin setup
              <input
                className={inputClassName}
                type="password"
                required
                autoFocus
                placeholder="Current password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            <Button
              className="w-full"
              size="lg"
              disabled={pending}
              type="submit"
            >
              {pending ? "Configuring MFA…" : "Set up authenticator app"}
            </Button>
          </form>
        )}

        {step === "setup" && (
          <div className="mt-6 space-y-6">
            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Step 1: Add to your authenticator app
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Copy the setup key into Google Authenticator, 1Password, or your
                preferred TOTP app:
              </p>
              {totpURI ? (
                <div className="mt-3 break-all rounded-xl border border-border bg-card p-3 font-mono text-xs">
                  {totpURI}
                </div>
              ) : null}
            </div>

            {backupCodes.length > 0 && (
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Step 2: Save emergency backup codes
                  </h2>
                  <button
                    type="button"
                    onClick={copyBackupCodes}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {copiedCodes ? "Copied!" : "Copy all"}
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Store these codes in a safe place. Each code can be used once
                  if you lose access to your device.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-xl border border-border bg-card p-3 font-mono text-[11px]">
                  {backupCodes.map((code, idx) => (
                    <span key={idx} className="select-all">
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <form className="space-y-4" onSubmit={handleVerifyTotp}>
              <label className="block text-xs font-bold text-foreground/90">
                Step 3: Enter the 6-digit code from your authenticator app
                <input
                  className={inputClassName}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  autoFocus
                  placeholder="123456"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                />
              </label>

              <Button
                className="w-full"
                size="lg"
                disabled={pending}
                type="submit"
              >
                {pending ? "Verifying…" : "Confirm and enable MFA"}
              </Button>
            </form>
          </div>
        )}

        {step === "done" && (
          <div className="mt-6 space-y-4 text-center">
            <p className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm font-semibold text-success">
              MFA successfully enabled! Redirecting to admin console…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
