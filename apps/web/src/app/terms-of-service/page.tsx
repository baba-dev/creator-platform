import type { Metadata, Route } from "next";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Brand } from "@/components/ui/brand";
import { CreativeSurface, Eyebrow } from "@/components/ui/creative";
import { Icon } from "@/components/ui/icon";
import { StatusDot, Tape } from "@/components/ui/sketch";

export const metadata: Metadata = {
  title: "Terms of Service · Aiwa Creators",
  description:
    "Official Terms of Service and Customer Agreement for Aiwa Creators by Aiwa Media Group LLC.",
};

const sections = [
  { id: "agreement", title: "1. Binding Agreement & Entity" },
  { id: "eligibility-accounts", title: "2. Eligibility & Workspace Access" },
  { id: "credits-ledger", title: "3. Credits, Ledger & Financial Policy" },
  { id: "acceptable-use", title: "4. Acceptable Use & Content Guidelines" },
  {
    id: "intellectual-property",
    title: "5. Intellectual Property & Asset Provenance",
  },
  { id: "ai-disclaimer", title: "6. AI Provider Inference & Disclaimers" },
  { id: "storage-lifecycle", title: "7. Asset Storage & 30-Day Purge Policy" },
  { id: "liability", title: "8. Limitation of Liability & Indemnity" },
  { id: "suspension-termination", title: "9. Termination & Account Closure" },
  { id: "governing-law", title: "10. Governing Law & Dispute Resolution" },
  { id: "modifications", title: "11. Terms Modifications" },
  { id: "contact", title: "12. Contact & Legal Enquiries" },
];

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      {/* Background atmosphere */}
      <div className="creative-glow pointer-events-none absolute inset-x-0 top-0 h-[640px]" />
      <div className="paper-grid pointer-events-none absolute inset-x-0 top-0 h-[600px] opacity-45 [mask-image:linear-gradient(to_bottom,black,transparent)]" />

      {/* Header Chrome */}
      <header className="relative z-30 mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-4 px-5 sm:px-7 lg:px-10">
        <Brand />
        <nav
          className="hidden items-center gap-1 rounded-full border border-border bg-card/75 p-1 text-xs font-semibold text-muted-foreground shadow-xs backdrop-blur-xl md:flex"
          aria-label="Public navigation"
        >
          <Link
            href={"/" as Route}
            className="rounded-full px-4 py-2 transition hover:bg-secondary hover:text-foreground"
          >
            Home
          </Link>
          <Link
            href={"/privacy-policy" as Route}
            className="rounded-full px-4 py-2 transition hover:bg-secondary hover:text-foreground"
          >
            Privacy Policy
          </Link>
          <a
            href="#credits-ledger"
            className="rounded-full px-4 py-2 transition hover:bg-secondary hover:text-foreground"
          >
            Credit Terms
          </a>
          <a
            href="#intellectual-property"
            className="rounded-full px-4 py-2 transition hover:bg-secondary hover:text-foreground"
          >
            IP & Provenance
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href={"/sign-in" as Route}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-card px-4 text-xs font-semibold text-foreground transition hover:bg-secondary"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative mx-auto max-w-7xl px-5 pt-10 sm:px-7 lg:px-10 lg:pt-14">
        <div className="max-w-3xl">
          <StatusDot tone="primary">Legal Terms & Agreement</StatusDot>
          <h1 className="font-display mt-4 text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl">
            Terms of Service
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
            Fair, company-friendly, and law-abiding platform rules governing
            your access to Aiwa Creators, media generation workloads, credit
            ledgers, and asset ownership.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-subtle-foreground">
            <span className="inline-flex items-center gap-1.5 font-mono">
              <Icon name="sparkles" className="size-3.5 text-primary" />
              Effective: October 6, 2026
            </span>
            <span className="hidden sm:inline">·</span>
            <span className="font-mono">Jurisdiction: Sultanate of Oman</span>
          </div>
        </div>
      </section>

      {/* Main Content Layout */}
      <section className="relative mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-7 lg:grid-cols-[280px_1fr] lg:gap-14 lg:px-10 lg:py-16">
        {/* Sticky Table of Contents */}
        <aside className="hidden lg:block">
          <div className="sticky top-10 space-y-6">
            <div className="rounded-2xl border border-border bg-card/70 p-5 shadow-xs backdrop-blur-md">
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-primary">
                Terms Contents
              </p>
              <nav
                className="mt-3 space-y-1.5 text-xs font-medium text-muted-foreground"
                aria-label="Table of Contents"
              >
                {sections.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="block rounded-lg px-2.5 py-1.5 transition hover:bg-secondary hover:text-foreground"
                  >
                    {s.title}
                  </a>
                ))}
              </nav>
            </div>

            <CreativeSurface className="relative p-5">
              <Tape className="-top-3 left-6 h-4 w-16" />
              <Eyebrow>Customer Ownership</Eyebrow>
              <p className="mt-2 text-xs leading-5 text-foreground">
                You own all generated outputs created under your paid account,
                subject to full credit settlement.
              </p>
            </CreativeSurface>
          </div>
        </aside>

        {/* Legal Text Body */}
        <article className="max-w-3xl space-y-12 text-sm leading-relaxed text-foreground/90 sm:text-base">
          {/* Quick Summary Banner */}
          <CreativeSurface variant="sketch" className="p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon name="sparkles" className="size-5" />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold text-foreground">
                  Our Truth & Financial Integrity Standard
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  We guarantee full transparency: platform credits map directly
                  to Oman Rials (OMR) at 1 credit per baisa, credit reservations
                  happen prior to provider dispatch, wallet histories are
                  immutable, and asset provenance is strictly preserved.
                </p>
              </div>
            </div>
          </CreativeSurface>

          {/* Section 1: Agreement */}
          <section
            id="agreement"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <Eyebrow>Section 1</Eyebrow>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              1. Binding Agreement & Entity
            </h2>
            <p>
              These Terms of Service (&quot;Terms&quot;) constitute a legally
              binding agreement between you (&quot;Customer&quot;,
              &quot;User&quot;, or &quot;You&quot;) and{" "}
              <strong>Aiwa Media Group LLC</strong> (&quot;Aiwa Media
              Group&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;),
              a commercial entity registered in Muscat, Sultanate of Oman,
              governing your access to and use of the{" "}
              <strong>Aiwa Creators</strong> website (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                creator.aiwamediagroup.com
              </code>
              ), APIs, background workers, and AI media generation services
              (collectively, the &quot;Platform&quot;).
            </p>
            <p>
              By creating an account, clicking &quot;Start creating&quot;, or
              accessing the Platform, you acknowledge that you have read,
              understood, and agree to be bound by these Terms and our{" "}
              <Link
                href={"/privacy-policy" as Route}
                className="text-primary underline font-medium"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          {/* Section 2: Eligibility */}
          <section
            id="eligibility-accounts"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <Eyebrow>Section 2</Eyebrow>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              2. Eligibility & Workspace Access
            </h2>
            <p>
              <strong>Age Requirement:</strong> You must be at least 18 years of
              age (or the legal age of majority in your jurisdiction) to form a
              binding contract with Aiwa Media Group.
            </p>
            <p>
              <strong>Entity Representation:</strong> If you register an account
              on behalf of an organization, company, or agency, you represent
              and warrant that you possess the legal authority to bind that
              entity to these Terms.
            </p>
            <p>
              <strong>Account Security:</strong> You are responsible for
              maintaining the confidentiality of your access credentials. All
              activities occurring under your account or organization tenant are
              your sole responsibility. You agree to notify us immediately at{" "}
              <a
                href="mailto:security@aiwamediagroup.com"
                className="text-primary underline"
              >
                security@aiwamediagroup.com
              </a>{" "}
              upon suspecting unauthorized access.
            </p>
          </section>

          {/* Section 3: Credits & Ledger */}
          <section
            id="credits-ledger"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <Eyebrow>Section 3</Eyebrow>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              3. Credits, Ledger & Financial Policy
            </h2>
            <p>
              Platform usage is governed by our exact integer credit reservation
              and settlement framework:
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-card/60 p-4">
                <h3 className="font-display text-sm font-semibold text-foreground">
                  1 Credit = 1 OMR Baisa
                </h3>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Standard credit grants and purchases evaluate at a baseline of
                  1 credit per OMR baisa (1,000 baisa = 1 OMR). Promotional
                  bonuses are recorded as separate audited grants.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card/60 p-4">
                <h3 className="font-display text-sm font-semibold text-foreground">
                  Pre-Reservation Policy
                </h3>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Customer credits are reserved prior to submitting billable
                  provider requests. If a provider call fails or is rejected,
                  reserved credits are automatically released or credited back.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card/60 p-4">
                <h3 className="font-display text-sm font-semibold text-foreground">
                  Immutable Wallet History
                </h3>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Wallet transaction records are permanent and immutable.
                  Corrections are executed strictly via audited reversal or
                  adjustment entries; past entries are never deleted or
                  rewritten.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card/60 p-4">
                <h3 className="font-display text-sm font-semibold text-foreground">
                  Integer Math Guarantee
                </h3>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  All monetary calculations store OMR as integer baisa, provider
                  USD costs as integer micro-USD, and platform credits as
                  integers to prevent rounding errors.
                </p>
              </div>
            </div>
            <p className="pt-2 text-xs text-subtle-foreground">
              Purchased credits are non-refundable except where explicitly
              required by Omani Consumer Protection laws or written commercial
              agreement with Aiwa Media Group LLC.
            </p>
          </section>

          {/* Section 4: Acceptable Use */}
          <section
            id="acceptable-use"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <Eyebrow>Section 4</Eyebrow>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              4. Acceptable Use & Content Guidelines
            </h2>
            <p>
              You agree to use Aiwa Creators in full compliance with the laws of
              the Sultanate of Oman (including Penal Code Royal Decree 7/1974
              and Cybercrime Law Royal Decree 12/2011) and international content
              regulations.
            </p>
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <p className="font-display text-sm font-semibold text-foreground">
                Strictly Prohibited Content & Behavior:
              </p>
              <ul className="space-y-2 text-xs text-muted-foreground sm:text-sm list-disc pl-4">
                <li>
                  Generation of illegal, pornographic, obscene, or defamatory
                  media.
                </li>
                <li>
                  Creating non-consensual deepfakes, impersonation of real
                  individuals, or fraudulent media.
                </li>
                <li>
                  Infringing upon third-party trademarks, copyrights, patents,
                  or trade secrets.
                </li>
                <li>
                  Generating hate speech, violence, terrorism content, or
                  materials undermining public order.
                </li>
                <li>
                  Attempting to bypass security controls, reverse-engineer model
                  prompts, or overburden media queues.
                </li>
              </ul>
            </div>
            <p className="text-xs text-subtle-foreground">
              Aiwa Media Group reserves the right to review flagged media jobs,
              suspend non-compliant accounts, and report severe violations to
              Oman law enforcement authorities.
            </p>
          </section>

          {/* Section 5: Intellectual Property */}
          <section
            id="intellectual-property"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <Eyebrow>Section 5</Eyebrow>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              5. Intellectual Property & Asset Provenance
            </h2>
            <p>
              <strong>Your Media Rights:</strong> As between you and Aiwa Media
              Group LLC, and subject to your full payment of reserved credits
              and compliance with these Terms, you retain full ownership of all
              uploaded reference media and own all right, title, and interest in
              generated visual/audio outputs produced by your jobs.
            </p>
            <p>
              <strong>Immutable Provenance:</strong> Generated media items
              maintain an immutable provenance record tying the canonical{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                Asset
              </code>{" "}
              ID to its originating generation job, model identifier, creation
              timestamp, and tenant scope. Organizing or renaming assets does
              not alter underlying job provenance.
            </p>
            <p>
              <strong>Platform IP:</strong> Aiwa Media Group LLC retains all
              proprietary rights to the Aiwa Creators brand, software code,
              Pencil & Pixel design system, API adapters (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                @aiwa/providers
              </code>
              ), and platform architecture.
            </p>
          </section>

          {/* Section 6: AI Inference Disclaimers */}
          <section
            id="ai-disclaimer"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <Eyebrow>Section 6</Eyebrow>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              6. AI Provider Inference & Service Disclaimers
            </h2>
            <p>
              Generation workloads are executed via enterprise provider adapters
              connecting to <strong>BytePlus</strong> (Seedream, Seedance, Seed
              Speech models) and <strong>NVIDIA NIM</strong> infrastructure.
            </p>
            <ul className="space-y-2.5 pl-4 text-xs sm:text-sm text-muted-foreground list-disc">
              <li>
                <strong>Nature of Generative Outputs:</strong> Generative AI
                outputs are produced probabilistically. Due to the stochastic
                nature of machine learning, similar prompts across different
                users may produce similar outputs.
              </li>
              <li>
                <strong>As-Is Service:</strong> The Platform and generated
                content are provided on an &quot;AS IS&quot; and &quot;AS
                AVAILABLE&quot; basis without warranties of any kind, whether
                express or implied.
              </li>
              <li>
                <strong>Capacity Gates & Queue Containment:</strong>{" "}
                Long-running video and image rendering jobs operate under global
                worker concurrency limits and capacity gates to ensure fair
                resource allocation.
              </li>
            </ul>
          </section>

          {/* Section 7: Storage & 30-Day Purge */}
          <section
            id="storage-lifecycle"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <Eyebrow>Section 7</Eyebrow>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              7. Asset Storage & 30-Day Purge Policy
            </h2>
            <p>Media storage is governed by strict lifecycle rules:</p>
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div className="rounded-xl border border-border bg-card/60 p-4">
                <p className="font-semibold text-foreground">
                  Opaque Storage Keys
                </p>
                <p className="mt-1 text-muted-foreground">
                  Customer filenames are display metadata only; underlying
                  storage keys are server-generated and tenant-scoped.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card/60 p-4">
                <p className="font-semibold text-foreground">
                  30-Day Recoverable Trash
                </p>
                <p className="mt-1 text-muted-foreground">
                  Trash is a recoverable 30-day state. Bytes and derivative
                  variants are purged only after 30 days or manual operator
                  purge.
                </p>
              </div>
            </div>
          </section>

          {/* Section 8: Liability */}
          <section
            id="liability"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <Eyebrow>Section 8</Eyebrow>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              8. Limitation of Liability & Indemnity
            </h2>
            <p>To the maximum extent permitted under Sultanate of Oman law:</p>
            <p>
              <strong>Liability Cap:</strong> Aiwa Media Group LLC&apos;s
              cumulative liability for any claims arising out of or relating to
              these Terms or the Platform shall not exceed the total fees paid
              by Customer to Aiwa Media Group in the six (6) months prior to the
              incident, or 100 OMR, whichever is greater.
            </p>
            <p>
              <strong>Indirect Damages Exclusion:</strong> In no event shall
              Aiwa Media Group LLC be liable for indirect, incidental, special,
              consequential, or punitive damages, or loss of profits, revenue,
              or business data.
            </p>
            <p>
              <strong>Customer Indemnification:</strong> You agree to defend,
              indemnify, and hold harmless Aiwa Media Group LLC against any
              third-party claims or legal costs arising from your violation of
              these Terms or third-party IP infringement caused by your input
              prompts or reference assets.
            </p>
          </section>

          {/* Section 9: Termination */}
          <section
            id="suspension-termination"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <Eyebrow>Section 9</Eyebrow>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              9. Termination & Account Closure
            </h2>
            <p>
              You may stop using the Platform and close your account at any time
              by contacting{" "}
              <a
                href="mailto:support@aiwamediagroup.com"
                className="text-primary underline"
              >
                support@aiwamediagroup.com
              </a>
              .
            </p>
            <p>
              Aiwa Media Group LLC may suspend or terminate your account upon
              written notice if you materially breach these Terms, fail to
              settle credit reservations, or engage in prohibited conduct. Upon
              termination, your right to access the Platform ceases immediately.
            </p>
          </section>

          {/* Section 10: Governing Law */}
          <section
            id="governing-law"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <Eyebrow>Section 10</Eyebrow>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              10. Governing Law & Dispute Resolution
            </h2>
            <p>
              These Terms, their interpretation, and any disputes arising
              hereunder shall be governed exclusively by the laws of the{" "}
              <strong>Sultanate of Oman</strong>.
            </p>
            <p>
              The parties agree to attempt to resolve any dispute through
              good-faith negotiation. If negotiation fails, disputes shall be
              submitted to the exclusive jurisdiction of the competent courts of{" "}
              <strong>Muscat, Sultanate of Oman</strong>.
            </p>
          </section>

          {/* Section 11: Modifications */}
          <section
            id="modifications"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <Eyebrow>Section 11</Eyebrow>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              11. Terms Modifications
            </h2>
            <p>
              We reserve the right to modify these Terms to reflect platform
              updates, price changes, or statutory requirements. Revised Terms
              will be posted at this URL with an updated effective date.
              Continued use of the Platform following published changes
              constitutes acceptance of the modified Terms.
            </p>
          </section>

          {/* Section 12: Contact */}
          <section id="contact" className="scroll-mt-12 space-y-6">
            <Eyebrow>Section 12</Eyebrow>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              12. Contact & Legal Enquiries
            </h2>
            <p>
              For legal inquiries, commercial licensing, or terms
              clarifications, please contact:
            </p>

            <CreativeSurface className="p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="font-display text-base font-semibold text-foreground">
                    Legal & Compliance Department
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Aiwa Media Group LLC
                  </p>
                  <p className="mt-0.5 text-xs text-subtle-foreground">
                    Muscat, Sultanate of Oman
                  </p>
                </div>
                <a
                  href="mailto:legal@aiwamediagroup.com"
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-5 text-xs font-semibold text-primary-foreground shadow-xs transition hover:opacity-90"
                >
                  Contact Legal Team
                </a>
              </div>
            </CreativeSurface>
          </section>
        </article>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background/80">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-5 py-8 sm:flex-row sm:px-7 lg:px-10">
          <Brand />
          <nav
            aria-label="Footer legal links"
            className="flex items-center gap-6 text-xs text-muted-foreground"
          >
            <Link
              href={"/" as Route}
              className="transition hover:text-foreground"
            >
              Home
            </Link>
            <Link
              href={"/privacy-policy" as Route}
              className="transition hover:text-foreground"
            >
              Privacy Policy
            </Link>
            <Link
              href={"/terms-of-service" as Route}
              className="font-semibold text-foreground transition"
            >
              Terms of Service
            </Link>
            <Link
              href={"/sign-in" as Route}
              className="transition hover:text-foreground"
            >
              Sign In
            </Link>
          </nav>
          <p className="text-[11px] text-subtle-foreground">
            Aiwa Media Group · Muscat, Oman · Private platform preview
          </p>
        </div>
      </footer>
    </main>
  );
}
