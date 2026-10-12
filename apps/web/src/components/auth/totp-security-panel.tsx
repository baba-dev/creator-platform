"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** Existing factors cannot be re-shown. New backup codes replace old ones. */
export function TotpSecurityPanel({
  requiresPassword = true,
}: {
  requiresPassword?: boolean;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [rotationPassword, setRotationPassword] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function regenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      busy ||
      !window.confirm(
        "Replace your existing recovery codes? Any unused old codes will stop working.",
      )
    )
      return;
    setBusy(true);
    setCodes([]);
    setError(null);
    setNotice(null);
    try {
      const result = await authClient.twoFactor.generateBackupCodes({
        password: requiresPassword ? password : undefined,
      });
      if (result.error || !result.data?.backupCodes?.length) {
        setError(
          "Could not generate recovery codes. Check your password and try again.",
        );
        return;
      }
      setCodes(result.data.backupCodes);
      setPassword("");
    } catch {
      setError("Recovery-code rotation is unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function replaceAuthenticator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      busy ||
      !window.confirm(
        "Replace your authenticator? The current authenticator and all recovery codes will stop working immediately. You must enroll a new authenticator before using administrative features.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await authClient.twoFactor.disable({
        password: requiresPassword ? rotationPassword : undefined,
      });
      if (result.error) {
        setError(
          "Could not disable the old authenticator. Check your credentials and try again.",
        );
        return;
      }
      setCodes([]);
      setRotationPassword("");
      router.refresh();
    } catch {
      setError(
        "Authenticator replacement is unavailable. Your current factor has not been confirmed as disabled.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setNotice(
        "Recovery codes copied. Clear your clipboard after saving them privately.",
      );
    } catch {
      setError("Clipboard access failed. Select the recovery codes manually.");
    }
  }
  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-success/30 bg-success/10 p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-success">
          Protected
        </p>
        <h2 className="mt-2 text-lg font-semibold">Authenticator is active</h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Your existing TOTP key cannot be displayed again. Sign-in requires a
          current authenticator code. Keep your recovery codes in a secure,
          private place.
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-semibold">Replace recovery codes</h3>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Use this if previous recovery codes were lost or disclosed. Rotating
          invalidates all previous recovery codes, but does not change the
          authenticator on your phone.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-3 text-xs text-foreground">
            {notice}
          </p>
        )}
        {!codes.length ? (
          <form className="mt-4 space-y-3" onSubmit={regenerate}>
            {requiresPassword ? (
              <label className="block text-xs font-semibold">
                Confirm your password
                <input
                  className="form-control mt-2 text-sm"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            ) : (
              <p className="text-xs text-muted-foreground">
                Your linked sign-in or passkey-only account has no local
                password. This action uses your authenticated session.
              </p>
            )}
            <Button type="submit" variant="secondary" disabled={busy}>
              {busy ? "Replacing…" : "Generate new recovery codes"}
            </Button>
          </form>
        ) : (
          <div className="mt-4 space-y-3">
            <p role="status" className="text-xs font-semibold">
              Save these codes now. They will not be displayed again.
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/30 p-3 font-mono text-xs">
              {codes.map((code, i) => (
                <span key={i} className="select-all">
                  {code}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void copyCodes()}
              >
                Copy codes
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setCodes([]);
                  setNotice("Recovery codes hidden.");
                }}
              >
                I&apos;ve saved them — hide codes
              </Button>
            </div>
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-semibold">Replace authenticator</h3>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          If the old QR code or setup key was disclosed, replace the TOTP
          secret—not just the recovery codes. This immediately disables the
          current factor. Re-enroll from the next screen.
        </p>
        <form className="mt-4 space-y-3" onSubmit={replaceAuthenticator}>
          {requiresPassword && (
            <label className="block text-xs font-semibold">
              Confirm your current password
              <input
                className="form-control mt-2 text-sm"
                type="password"
                autoComplete="current-password"
                required
                value={rotationPassword}
                onChange={(e) => setRotationPassword(e.target.value)}
              />
            </label>
          )}
          <Button type="submit" variant="secondary" disabled={busy}>
            {busy ? "Updating…" : "Replace my authenticator"}
          </Button>
        </form>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        If you lose both your authenticator and recovery codes, contact platform
        support for a verified identity recovery procedure. Administrators must
        never send an existing TOTP secret to another account holder.
      </p>
    </section>
  );
}
