"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import {
  parseTotpProvisioning,
  type TotpProvisioning,
} from "@/lib/totp-provisioning";

type Step = "intro" | "setup" | "done";
type Guide = "google" | "microsoft";

const inputStyle = "form-control mt-2 text-sm";
const guideContent: Record<Guide, { name: string; instructions: string }> = {
  google: {
    name: "Google Authenticator",
    instructions: "Open Google Authenticator, tap +, choose Scan a QR code, then scan the code below. For manual setup choose Enter a setup key and select Time based.",
  },
  microsoft: {
    name: "Microsoft Authenticator",
    instructions: "Open Microsoft Authenticator, tap +, select Other account (Google, Facebook, etc.), then Scan QR code. Do not choose Work or school account for this generic TOTP token.",
  },
};

/**
 * Enrollment is always performed by the signed-in account owner, never by
 * sending a provisioning secret to another user or a third-party QR service.
 */
export function TotpEnrollment({
  accountEmail,
  administrative = false,
}: {
  accountEmail: string;
  administrative?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [password, setPassword] = useState("");
  const [provisioning, setProvisioning] = useState<TotpProvisioning | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [guide, setGuide] = useState<Guide>("google");
  const [manualOpen, setManualOpen] = useState(false);
  const [secretVisible, setSecretVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await authClient.twoFactor.enable({ password });
      if (response.error || !response.data) {
        setError("Unable to begin setup. Check your password and try again. Accounts without a password must set one before enrolling.");
        return;
      }
      const payload = response.data as { totpURI?: string; backupCodes?: string[] };
      const parsed = parseTotpProvisioning(payload.totpURI ?? "", accountEmail);
      if (!parsed || !payload.backupCodes?.length) {
        setError("The authenticator setup response is incomplete. Please retry; no QR or key has been displayed.");
        return;
      }
      setProvisioning(parsed);
      setBackupCodes(payload.backupCodes);
      setPassword("");
      setStep("setup");
    } catch {
      setError("Authenticator setup could not be started. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !provisioning || !/^\d{6}$/.test(code.trim())) {
      setError("Enter the current six-digit code shown by your authenticator.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: code.trim() });
      if (result.error) {
        setError("That code did not verify. Check the selected account and ensure your phone's time is automatic, then enter a fresh code.");
        return;
      }
      setProvisioning(null);
      setCode("");
      setBackupCodes([]);
      setStep("done");
      router.refresh();
    } catch {
      setError("Verification could not be completed. Try a fresh code.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied. Clear your clipboard after use.`);
    } catch {
      setNotice("Clipboard unavailable. You can select and copy the revealed text manually.");
    }
  }

  return (
    <section className="space-y-5" aria-label="Authenticator enrollment">
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.04] p-5">
        <svg aria-hidden="true" viewBox="0 0 120 70" className="pointer-events-none absolute -right-2 -top-1 h-24 w-40 text-primary/25" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="12" y="7" width="41" height="55" rx="12" /><path d="M22 19h21M25 51h15M34 28v13m-6-6h12M69 30l16-12 16 12v12c0 10-9 16-16 19-7-3-16-9-16-19z" /><path d="m77 40 6 6 11-13" />
        </svg>
        <p className="text-[11px] font-bold uppercase tracking-[.16em] text-primary">Private account security</p>
        <h2 className="mt-2 max-w-xs font-display text-xl font-semibold">Protect your Creators account</h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          {administrative
            ? "Administrative access requires an authenticator code after password sign-in."
            : "Add an authenticator as an extra layer of protection for your account."}
          {" "}Only enroll on a device you control. Do not send your QR code, setup key, or recovery codes over WhatsApp.
        </p>
      </div>

      {error && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-foreground">{notice}</p>}

      {step === "intro" && (
        <form onSubmit={begin} className="space-y-4">
          <p className="text-sm text-muted-foreground">You will get a private QR code compatible with Google Authenticator and Microsoft Authenticator, a manual setup key, and one-time recovery codes.</p>
          <label className="block text-xs font-semibold">
            Confirm your Creators password
            <input className={inputStyle} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your current password" />
          </label>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? "Preparing secure setup…" : "Set up authenticator"}</Button>
        </form>
      )}

      {step === "setup" && provisioning && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border p-4 sm:p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary">1 · Choose your app</p>
            <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Authenticator instructions">
              {(["google", "microsoft"] as const).map((app) => (
                <button key={app} type="button" aria-pressed={guide === app} onClick={() => setGuide(app)}
                  className={`rounded-xl border p-3 text-left text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-ring ${guide === app ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"}`}>
                  <span className="mb-2 inline-flex size-8 items-center justify-center rounded-lg bg-muted/50 text-base" aria-hidden="true">{app === "google" ? "G" : "M"}</span>
                  <span className="block">{app === "google" ? "Google Authenticator" : "Microsoft Authenticator"}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{guideContent[guide].instructions}</p>

            <div className="mt-4 flex justify-center rounded-2xl border border-border bg-white p-5">
              <QRCodeSVG value={provisioning.uri} size={220} level="M" marginSize={2} bgColor="#FFFFFF" fgColor="#121212" title={`Scan to add ${provisioning.account} to ${guideContent[guide].name}`} />
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">Scan with the app on your phone. The QR never leaves this browser for an external image-generation service.</p>
            <a href={provisioning.uri} className="mt-3 block rounded-xl border border-border px-4 py-2.5 text-center text-xs font-semibold hover:border-primary/40">
              Try opening in an authenticator app ↗
            </a>
            <p className="mt-1 text-center text-[11px] text-muted-foreground">On the same phone, app-link support depends on your browser and installed app. Scanning is the reliable option.</p>

            <button type="button" className="mt-4 w-full text-left text-xs font-semibold text-primary underline underline-offset-4" aria-expanded={manualOpen} onClick={() => setManualOpen((v) => !v)}>
              {manualOpen ? "Hide" : "Can't scan? Show"} manual setup details
            </button>
            {manualOpen && (
              <div className="mt-3 space-y-3 rounded-xl border border-border bg-muted/20 p-3 text-xs">
                <div><span className="text-muted-foreground">Account</span><p className="mt-1 break-all font-semibold">{provisioning.account}</p></div>
                <div><span className="text-muted-foreground">Issuer</span><p className="mt-1 font-semibold">{provisioning.issuer}</p></div>
                <div className="grid grid-cols-3 gap-2">
                  <div><span className="text-muted-foreground">Type</span><p className="font-semibold">Time based</p></div>
                  <div><span className="text-muted-foreground">Digits</span><p className="font-semibold">{provisioning.digits}</p></div>
                  <div><span className="text-muted-foreground">Period</span><p className="font-semibold">{provisioning.period}s</p></div>
                </div>
                <div><span className="text-muted-foreground">Algorithm</span><p className="font-semibold">{provisioning.algorithm}</p></div>
                <div>
                  <span className="text-muted-foreground">Secret setup key</span>
                  <p className="mt-1 break-all rounded-lg bg-card p-2 font-mono text-sm" aria-label={secretVisible ? "Visible setup key" : "Hidden setup key"}>{secretVisible ? provisioning.secret : "•••• •••• •••• ••••"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => setSecretVisible((v) => !v)}>{secretVisible ? "Hide key" : "Reveal key"}</Button>
                    <Button type="button" variant="secondary" size="sm" disabled={!secretVisible} onClick={() => void copy(provisioning.secret, "Setup key")}>Copy key</Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border p-4 sm:p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary">2 · Save your recovery codes</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">These single-use codes restore access if you lose your phone. Save them in a password manager or another private offline location. They will not be shown again after this setup is complete.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-muted/30 p-3 font-mono text-xs">
              {backupCodes.map((backup, i) => <span key={i} className="select-all">{backup}</span>)}
            </div>
            <Button type="button" className="mt-3" size="sm" variant="secondary" onClick={() => void copy(backupCodes.join("\n"), "Recovery codes")}>Copy recovery codes</Button>
          </div>

          <form onSubmit={verify} className="space-y-3 rounded-2xl border border-border p-4 sm:p-5">
            <label className="block text-xs font-bold">
              3 · Verify the six-digit code in your app
              <input className={inputStyle} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                type="text" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="one-time-code" autoFocus required placeholder="000000" />
            </label>
            <Button type="submit" size="lg" className="w-full" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify and activate 2FA"}</Button>
            <p className="text-[11px] leading-5 text-muted-foreground">Do not close this screen until your recovery codes are saved and the authenticator code verifies successfully.</p>
          </form>
        </div>
      )}

      {step === "done" && (
        <div role="status" className="rounded-2xl border border-success/30 bg-success/10 p-5">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="mb-3 size-9 text-success" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10" /><path d="m7 12 3 3 7-7" /></svg>
          <h3 className="text-lg font-semibold">Authenticator enabled</h3>
          <p className="mt-2 text-xs leading-5">Your setup key and recovery codes have been cleared from this screen. Keep your saved recovery codes private.</p>
          <Button className="mt-4" onClick={() => router.refresh()}>Continue</Button>
        </div>
      )}
    </section>
  );
}
