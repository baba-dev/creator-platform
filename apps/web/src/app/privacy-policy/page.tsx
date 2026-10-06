import type { Metadata, Route } from "next";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Brand } from "@/components/ui/brand";
import { CreativeSurface, Eyebrow, Annotation } from "@/components/ui/creative";
import { Icon, type IconName } from "@/components/ui/icon";
import { DemoBadge, StatusDot, Tape } from "@/components/ui/sketch";

export const metadata: Metadata = {
  title: "Privacy Policy · Aiwa Creators",
  description:
    "Official Privacy Policy and Data Protection Notice for Aiwa Creators by Aiwa Media Group LLC.",
};

const sections: readonly { id: string; title: string; icon: IconName }[] = [
  { id: "overview", title: "1. Overview & Data Controller", icon: "shield" },
  {
    id: "information-collected",
    title: "2. Information We Collect",
    icon: "assets",
  },
  {
    id: "ai-processing",
    title: "3. AI Processing & All-Truth Disclosure",
    icon: "bot",
  },
  {
    id: "asset-lifecycle",
    title: "4. Asset Storage & 30-Day Lifecycle",
    icon: "trash",
  },
  {
    id: "financial-ledger",
    title: "5. Financial Ledger & Credit Reservation",
    icon: "credits",
  },
  { id: "legal-bases", title: "6. Legal Bases for Processing", icon: "script" },
  {
    id: "data-sharing",
    title: "7. Third-Party Sharing & Transfers",
    icon: "globe",
  },
  {
    id: "security",
    title: "8. Technical & Organizational Security",
    icon: "admin",
  },
  {
    id: "user-rights",
    title: "9. Your Rights & Data Subject Controls",
    icon: "user",
  },
  { id: "cookies", title: "10. Cookies & Local Storage", icon: "settings" },
  { id: "children", title: "11. Children's Privacy", icon: "brand" },
  {
    id: "updates-contact",
    title: "12. Policy Updates & Contact",
    icon: "chat",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      {/* Background atmosphere */}
      <div className="creative-glow pointer-events-none absolute inset-x-0 top-0 h-[720px]" />
      <div className="paper-grid pointer-events-none absolute inset-x-0 top-0 h-[680px] opacity-45 [mask-image:linear-gradient(to_bottom,black,transparent)]" />

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
          <a
            href="#overview"
            className="rounded-full px-4 py-2 transition hover:bg-secondary hover:text-foreground"
          >
            Privacy Overview
          </a>
          <a
            href="#ai-processing"
            className="rounded-full px-4 py-2 transition hover:bg-secondary hover:text-foreground"
          >
            AI Data Processing
          </a>
          <a
            href="#user-rights"
            className="rounded-full px-4 py-2 transition hover:bg-secondary hover:text-foreground"
          >
            Your Rights
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

      {/* Hero Section with Visual Badges */}
      <section className="relative mx-auto max-w-7xl px-5 pt-10 sm:px-7 lg:px-10 lg:pt-14">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <StatusDot tone="primary">Legal & Privacy Safeguards</StatusDot>
              <DemoBadge>Sultanate of Oman</DemoBadge>
            </div>
            <h1 className="font-display mt-4 text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl">
              Privacy Policy & Data Notice
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Complete transparency regarding how Aiwa Media Group collects,
              processes, secures, and disposes of your personal information and
              creative assets across the Aiwa Creators platform.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-subtle-foreground">
              <span className="inline-flex items-center gap-1.5 font-mono">
                <Icon name="sparkles" className="size-3.5 text-primary" />
                Effective: October 6, 2026
              </span>
              <span className="hidden sm:inline">·</span>
              <span className="font-mono">
                Jurisdiction: Sultanate of Oman (PDPL Royal Decree 6/2022)
              </span>
            </div>
          </div>

          {/* SVG Vector Graphic Card for Hero */}
          <div className="relative">
            <DataProtectionHeroGraphic />
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
                On This Page
              </p>
              <nav
                className="mt-3 space-y-1 text-xs font-medium text-muted-foreground"
                aria-label="Table of Contents"
              >
                {sections.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition hover:bg-secondary hover:text-foreground"
                  >
                    <Icon
                      name={s.icon}
                      className="size-3.5 text-subtle-foreground"
                    />
                    <span className="truncate">{s.title}</span>
                  </a>
                ))}
              </nav>
            </div>

            <CreativeSurface className="relative p-5">
              <Tape className="-top-3 left-6 h-4 w-16" />
              <Eyebrow>Commitment</Eyebrow>
              <p className="mt-2 text-xs leading-5 text-foreground">
                We never sell your prompt history or generated media to
                third-party advertisers.
              </p>
              <Annotation className="mt-3 text-sm">
                100% Zero-Selling Guarantee →
              </Annotation>
            </CreativeSurface>
          </div>
        </aside>

        {/* Legal Text Body with Vector Graphics & Cards */}
        <article className="max-w-3xl space-y-12 text-sm leading-relaxed text-foreground/90 sm:text-base">
          {/* Quick Summary Banner */}
          <CreativeSurface variant="sketch" className="p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary shadow-xs">
                <Icon name="shield" className="size-6" />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold text-foreground">
                  Our All-Truth Privacy Promise
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  Aiwa Creators operates under a strict truth policy. We state
                  clearly which AI models process your content, how financial
                  reserves work, how original assets remain private, and how
                  your media is deleted after 30 days in recoverable trash.
                </p>
              </div>
            </div>
          </CreativeSurface>

          {/* Section 1: Overview */}
          <section
            id="overview"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon name="shield" className="size-4" />
              </span>
              <Eyebrow>Section 1</Eyebrow>
            </div>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              1. Overview & Data Controller
            </h2>
            <p>
              This Privacy Policy applies to the software services, APIs, and
              web platform operating under <strong>Aiwa Creators</strong>{" "}
              (accessible at{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                creator.aiwamediagroup.com
              </code>
              ), operated by <strong>Aiwa Media Group LLC</strong> (&quot;Aiwa
              Media Group&quot;, &quot;we&quot;, &quot;us&quot;, or
              &quot;our&quot;), headquartered in Muscat, Sultanate of Oman.
            </p>
            <p>
              We act as the <strong>Data Controller</strong> for account
              administrative data, financial transactions, and platform security
              telemetry, and as a{" "}
              <strong>Data Processor / Service Provider</strong> for
              customer-uploaded media assets and generative AI workspace
              workloads.
            </p>

            <div className="mt-4 rounded-xl border border-border bg-card/50 p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="size-2 rounded-full bg-success" />
                <span className="text-xs font-semibold text-foreground">
                  Royal Decree 6/2022 Verified
                </span>
              </div>
              <span className="font-mono text-[10px] uppercase text-subtle-foreground">
                Muscat, Oman
              </span>
            </div>
          </section>

          {/* Section 2: Information Collected */}
          <section
            id="information-collected"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon name="assets" className="size-4" />
              </span>
              <Eyebrow>Section 2</Eyebrow>
            </div>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              2. Information We Collect
            </h2>
            <p>
              To provide generative media workflows, we collect the following
              categories of information:
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <Icon name="user" className="size-4" />
                  <h3 className="font-display text-sm font-semibold text-foreground">
                    Account & Organization Identity
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Full name, work email address, password hashes,
                  tenant/organization affiliation, avatar, and assigned
                  administrative permissions.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2">
                <div className="flex items-center gap-2 text-info">
                  <Icon name="assets" className="size-4" />
                  <h3 className="font-display text-sm font-semibold text-foreground">
                    Generative Prompts & Uploaded Media
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Text briefs, prompt parameters, style guidelines, and source
                  reference image/audio assets submitted for processing.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2">
                <div className="flex items-center gap-2 text-warning">
                  <Icon name="sparkles" className="size-4" />
                  <h3 className="font-display text-sm font-semibold text-foreground">
                    Generated Asset Provenance
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Generated images, videos, narration audio clips, job status
                  logs, model identifiers, seed parameters, and creation
                  timestamps.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2">
                <div className="flex items-center gap-2 text-success">
                  <Icon name="credits" className="size-4" />
                  <h3 className="font-display text-sm font-semibold text-foreground">
                    Financial & Credit Ledger Logs
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Platform credit balances, reservation tokens, micro-USD
                  provider cost entries, OMR baisa ledger records, and billing
                  metadata.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3: AI Processing & Coded SVG Diagram */}
          <section
            id="ai-processing"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon name="bot" className="size-4" />
              </span>
              <Eyebrow>Section 3</Eyebrow>
            </div>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              3. AI Provider Processing & All-Truth Disclosure
            </h2>
            <p>
              In full transparency under our <strong>All-Truth Policy</strong>,
              Aiwa Creators dispatches AI generation workloads to enterprise AI
              inference providers strictly through our internal integration
              adapters (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                @aiwa/providers
              </code>
              ).
            </p>

            {/* AI Provider Vector Diagram Graphic */}
            <div className="my-6">
              <AIProviderPipelineGraphic />
            </div>

            <div className="space-y-3 pt-2">
              <h3 className="font-display text-lg font-semibold text-foreground">
                Model Training & Commercial Usage Protections
              </h3>
              <p>
                <strong>No Public Model Training:</strong> Your prompts,
                uploaded reference files, and generated outputs are processed
                solely to fulfill your generation requests. Neither Aiwa Media
                Group nor our infrastructure providers use your private
                workspace media to train foundation AI models for public
                distribution without your explicit prior written consent.
              </p>
              <p>
                <strong>Credential Security:</strong> Provider API credentials
                are kept strictly server-side inside our isolated worker
                environment (
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  apps/worker
                </code>
                ). Secret credentials are never embedded into client components
                or exposed to web browsers.
              </p>
            </div>
          </section>

          {/* Section 4: Asset Storage & Lifecycle Graphic */}
          <section
            id="asset-lifecycle"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon name="trash" className="size-4" />
              </span>
              <Eyebrow>Section 4</Eyebrow>
            </div>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              4. Asset Storage & 30-Day Lifecycle
            </h2>
            <p>
              Every uploaded or generated media item receives a canonical
              server-generated identity (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                Asset
              </code>
              ). User-provided filenames are treated strictly as display
              metadata, while storage object keys are opaque, server-generated,
              and tenant-isolated.
            </p>

            {/* SVG Timeline Graphic for 30-Day Trash Lifecycle */}
            <div className="my-6">
              <AssetLifecycleGraphic />
            </div>

            <ul className="space-y-3 pl-4 text-xs text-muted-foreground sm:text-sm list-disc">
              <li>
                <strong>Original Media Privacy:</strong> Full-resolution
                original files remain private. Dashboard grids and thumbnail
                views render bounded derivative variants to preserve bandwidth
                and privacy.
              </li>
              <li>
                <strong>30-Day Recoverable Trash:</strong> Deleting an asset
                moves it to a recoverable 30-day trash state. Storage bytes and
                original/variant objects are not permanently purged from cloud
                storage until the 30-day lifecycle window expires or an audited
                operator purge completes.
              </li>
              <li>
                <strong>Immutable Provenance:</strong> Reorganizing assets into
                folders, tags, or projects preserves the immutable generation
                history of the job that produced the asset.
              </li>
            </ul>
          </section>

          {/* Section 5: Financial Ledger */}
          <section
            id="financial-ledger"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon name="credits" className="size-4" />
              </span>
              <Eyebrow>Section 5</Eyebrow>
            </div>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              5. Financial Ledger & Credit Reservation
            </h2>
            <p>
              Aiwa Creators enforces exact accounting integrity for platform
              usage:
            </p>
            <div className="grid gap-4 sm:grid-cols-3 text-xs">
              <div className="rounded-xl border border-border bg-card/60 p-4">
                <p className="font-mono text-[10px] uppercase font-bold text-primary">
                  Integer Math
                </p>
                <p className="mt-1.5 font-semibold text-foreground">
                  Exact Micro-USD & Baisa
                </p>
                <p className="mt-1 text-muted-foreground">
                  Monetary values are calculated as integer baisa (OMR) and
                  micro-USD to eliminate rounding drift.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card/60 p-4">
                <p className="font-mono text-[10px] uppercase font-bold text-primary">
                  Credit Pre-Reservation
                </p>
                <p className="mt-1.5 font-semibold text-foreground">
                  Prior to Generation
                </p>
                <p className="mt-1 text-muted-foreground">
                  Credits are reserved before dispatching job requests. Unused
                  reserves are refunded upon task completion.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card/60 p-4">
                <p className="font-mono text-[10px] uppercase font-bold text-primary">
                  Immutable History
                </p>
                <p className="mt-1.5 font-semibold text-foreground">
                  Audited Ledger
                </p>
                <p className="mt-1 text-muted-foreground">
                  Wallet history records cannot be deleted or rewritten.
                  Adjustments are posted as audited reversal entries.
                </p>
              </div>
            </div>
          </section>

          {/* Section 6: Legal Bases */}
          <section
            id="legal-bases"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon name="script" className="size-4" />
              </span>
              <Eyebrow>Section 6</Eyebrow>
            </div>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              6. Legal Bases for Processing
            </h2>
            <p>
              Under Omani PDPL and international regulations, we process
              personal data under the following legal grounds:
            </p>
            <ul className="space-y-2 pl-4 text-xs sm:text-sm text-muted-foreground list-disc">
              <li>
                <strong>Contractual Necessity:</strong> To deliver generation
                services, manage subscriptions, allocate platform credits, and
                store project media.
              </li>
              <li>
                <strong>Legitimate Business Interests:</strong> To maintain
                platform security, prevent unauthorized access, audit resource
                capacity, and optimize service performance.
              </li>
              <li>
                <strong>Legal Compliance:</strong> To comply with tax,
                commercial record-keeping, and regulatory duties under Sultanate
                of Oman legislation.
              </li>
              <li>
                <strong>Consent:</strong> For optional promotional
                communications, beta testing programs, or specific customer
                integration permissions.
              </li>
            </ul>
          </section>

          {/* Section 7: Data Sharing & Transfers */}
          <section
            id="data-sharing"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon name="globe" className="size-4" />
              </span>
              <Eyebrow>Section 7</Eyebrow>
            </div>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              7. Third-Party Sharing & Transfers
            </h2>
            <p>
              We do not rent, sell, or trade personal information to third
              parties. We share information only with:
            </p>
            <ul className="space-y-2 pl-4 text-xs sm:text-sm text-muted-foreground list-disc">
              <li>
                <strong>Infrastructure Sub-Processors:</strong> High-security
                cloud hosts, data centers, and specialized AI execution partners
                (BytePlus, NVIDIA).
              </li>
              <li>
                <strong>Financial Institutions & Payment Gateways:</strong>{" "}
                Payment processors managing Oman Rials (OMR) transactions and
                credit grants.
              </li>
              <li>
                <strong>Legal & Regulatory Authorities:</strong> When required
                by Omani court orders, law enforcement warrants, or statutory
                regulations.
              </li>
            </ul>
          </section>

          {/* Section 8: Technical Security */}
          <section
            id="security"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon name="admin" className="size-4" />
              </span>
              <Eyebrow>Section 8</Eyebrow>
            </div>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              8. Technical & Organizational Security
            </h2>
            <p>
              We enforce multi-layered defense to safeguard customer assets and
              account credentials:
            </p>
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div className="rounded-xl border border-border bg-card/60 p-4">
                <p className="font-semibold text-foreground">
                  Strict Schema Validation
                </p>
                <p className="mt-1 text-muted-foreground">
                  Every external API request boundary is strictly validated
                  using explicit Zod schemas.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card/60 p-4">
                <p className="font-semibold text-foreground">
                  Encryption Standard
                </p>
                <p className="mt-1 text-muted-foreground">
                  TLS 1.3 encryption in transit and AES-256 storage encryption
                  at rest across all media buckets.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card/60 p-4">
                <p className="font-semibold text-foreground">
                  Tenant Isolation
                </p>
                <p className="mt-1 text-muted-foreground">
                  Organization-scoped authorization revalidates ownership on
                  every folder, tag, asset, and generation job access.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card/60 p-4">
                <p className="font-semibold text-foreground">
                  No Plaintext Credential Logs
                </p>
                <p className="mt-1 text-muted-foreground">
                  Prompts, passwords, provider keys, and customer media URLs are
                  filtered from system logs.
                </p>
              </div>
            </div>
          </section>

          {/* Section 9: Your Rights Cards */}
          <section
            id="user-rights"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon name="user" className="size-4" />
              </span>
              <Eyebrow>Section 9</Eyebrow>
            </div>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              9. Your Rights & Data Subject Controls
            </h2>
            <p>
              Under Omani PDPL and international privacy laws, you possess the
              following rights regarding your personal data:
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  title: "Right of Access",
                  desc: "Request a copy of the personal data and asset metadata held about your account.",
                  icon: "search" as const,
                },
                {
                  title: "Right to Rectification",
                  desc: "Correct inaccurate profile data, organization details, or billing contact info.",
                  icon: "edit" as const,
                },
                {
                  title: "Right to Erasure",
                  desc: "Request permanent deletion of your account, workspace assets, and generation records.",
                  icon: "trash" as const,
                },
                {
                  title: "Right to Restriction",
                  desc: "Object to specific non-essential processing activities or withdraw consent at any time.",
                  icon: "shield" as const,
                },
                {
                  title: "Right to Portability",
                  desc: "Export your generated assets and metadata in standard file formats.",
                  icon: "upload" as const,
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-border bg-card/60 p-4 space-y-1.5"
                >
                  <div className="flex items-center gap-2 text-primary">
                    <Icon name={item.icon} className="size-4" />
                    <span className="font-semibold text-foreground text-xs">
                      {item.title}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
            <p className="pt-2 text-xs text-subtle-foreground">
              To exercise any of these rights, please contact our Data
              Protection Officer at{" "}
              <a
                href="mailto:privacy@aiwamediagroup.com"
                className="text-primary underline font-medium"
              >
                privacy@aiwamediagroup.com
              </a>
              . Requests are responded to within 30 days.
            </p>
          </section>

          {/* Section 10: Cookies */}
          <section
            id="cookies"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon name="settings" className="size-4" />
              </span>
              <Eyebrow>Section 10</Eyebrow>
            </div>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              10. Cookies & Local Storage
            </h2>
            <p>
              Aiwa Creators uses minimal, essential cookies and browser storage
              keys:
            </p>
            <ul className="space-y-2 pl-4 text-xs sm:text-sm text-muted-foreground list-disc">
              <li>
                <strong>Session Cookies:</strong> Strictly necessary HTTP-only
                authentication tokens for authorized navigation.
              </li>
              <li>
                <strong>
                  Local Storage (
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                    aiwa-theme
                  </code>
                  ):
                </strong>{" "}
                Persists your explicit Light or Dark mode UI theme choice across
                visits.
              </li>
              <li>
                <strong>No Advertising Cookies:</strong> We do not place
                third-party cross-site advertising cookies or behavioral
                tracking beacons.
              </li>
            </ul>
          </section>

          {/* Section 11: Children's Privacy */}
          <section
            id="children"
            className="scroll-mt-12 space-y-4 border-b border-border pb-10"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon name="brand" className="size-4" />
              </span>
              <Eyebrow>Section 11</Eyebrow>
            </div>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              11. Children&apos;s Privacy
            </h2>
            <p>
              Aiwa Creators is an enterprise creative platform designed for
              adult professionals, businesses, and organizations. We do not
              knowingly solicit or collect personal information from individuals
              under 18 years of age. If we become aware that a minor has created
              an account, we will take immediate steps to remove the account and
              purge associated data.
            </p>
          </section>

          {/* Section 12: Updates & Contact */}
          <section id="updates-contact" className="scroll-mt-12 space-y-6">
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon name="chat" className="size-4" />
              </span>
              <Eyebrow>Section 12</Eyebrow>
            </div>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              12. Policy Updates & Contact Information
            </h2>
            <p>
              We may update this Privacy Policy to reflect platform
              enhancements, operational changes, or statutory updates under
              Omani law. Material modifications will be announced via in-app
              notification or email prior to taking effect.
            </p>

            <CreativeSurface className="p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="font-display text-base font-semibold text-foreground">
                    Data Protection Enquiries
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Aiwa Media Group LLC · Legal & Privacy Office
                  </p>
                  <p className="mt-0.5 text-xs text-subtle-foreground">
                    Muscat, Sultanate of Oman
                  </p>
                </div>
                <a
                  href="mailto:privacy@aiwamediagroup.com"
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-5 text-xs font-semibold text-primary-foreground shadow-xs transition hover:opacity-90"
                >
                  Contact Privacy Team
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
            aria-label="Footer privacy links"
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
              className="font-semibold text-foreground transition"
            >
              Privacy Policy
            </Link>
            <Link
              href={"/terms-of-service" as Route}
              className="transition hover:text-foreground"
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

{
  /* Visual Vector Graphics Components */
}

function DataProtectionHeroGraphic() {
  return (
    <CreativeSurface className="relative overflow-hidden rounded-[28px] p-6 shadow-md">
      <div className="absolute -right-16 -top-16 size-48 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-success" />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-foreground">
              Data Security Architecture
            </span>
          </div>
          <span className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            TLS 1.3 · AES-256
          </span>
        </div>

        {/* Coded SVG Diagram */}
        <div className="relative py-2">
          <svg
            className="w-full text-foreground"
            viewBox="0 0 340 140"
            fill="none"
          >
            {/* Background Grid */}
            <pattern
              id="grid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.06"
                strokeWidth="1"
              />
            </pattern>
            <rect width="340" height="140" fill="url(#grid)" rx="12" />

            {/* Nodes */}
            <g transform="translate(15, 45)">
              <rect
                width="80"
                height="50"
                rx="8"
                fill="var(--card)"
                stroke="var(--border)"
                strokeWidth="1.5"
              />
              <text
                x="40"
                y="22"
                textAnchor="middle"
                fill="currentColor"
                fontSize="10"
                fontWeight="600"
              >
                Client UI
              </text>
              <text
                x="40"
                y="36"
                textAnchor="middle"
                fill="var(--muted-foreground)"
                fontSize="8"
              >
                Tenant Scope
              </text>
            </g>

            <g transform="translate(130, 45)">
              <rect
                width="80"
                height="50"
                rx="8"
                fill="var(--card)"
                stroke="var(--primary)"
                strokeWidth="2"
              />
              <text
                x="40"
                y="22"
                textAnchor="middle"
                fill="currentColor"
                fontSize="10"
                fontWeight="700"
              >
                @aiwa/providers
              </text>
              <text
                x="40"
                y="36"
                textAnchor="middle"
                fill="var(--primary)"
                fontSize="8"
              >
                Isolated Adapter
              </text>
            </g>

            <g transform="translate(245, 45)">
              <rect
                width="80"
                height="50"
                rx="8"
                fill="var(--card)"
                stroke="var(--border)"
                strokeWidth="1.5"
              />
              <text
                x="40"
                y="22"
                textAnchor="middle"
                fill="currentColor"
                fontSize="10"
                fontWeight="600"
              >
                BytePlus / NVIDIA
              </text>
              <text
                x="40"
                y="36"
                textAnchor="middle"
                fill="var(--muted-foreground)"
                fontSize="8"
              >
                Private Job
              </text>
            </g>

            {/* Connection Lines */}
            <path
              d="M 95 70 L 130 70"
              stroke="var(--primary)"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
            <path
              d="M 210 70 L 245 70"
              stroke="var(--primary)"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
          </svg>
        </div>

        <div className="flex items-center justify-between text-[11px] text-subtle-foreground">
          <span>Zero third-party advertising</span>
          <span className="font-mono">Audited Omani Compliance</span>
        </div>
      </div>
    </CreativeSurface>
  );
}

function AIProviderPipelineGraphic() {
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-5 shadow-xs">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <p className="font-mono text-xs font-bold uppercase tracking-wider text-primary">
          AI Generation Data Pipeline
        </p>
        <span className="font-mono text-[10px] text-subtle-foreground">
          Private Sandbox
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-background/60 p-3">
          <div className="flex items-center gap-2 text-primary">
            <Icon name="edit" className="size-4" />
            <span className="font-semibold text-xs text-foreground">
              Input Brief
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            User prompt & reference asset ID
          </p>
        </div>

        <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
          <div className="flex items-center gap-2 text-primary">
            <Icon name="bot" className="size-4" />
            <span className="font-semibold text-xs text-foreground">
              Secure Adapter
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Zod validation & API credential filter
          </p>
        </div>

        <div className="rounded-xl border border-border bg-background/60 p-3">
          <div className="flex items-center gap-2 text-success">
            <Icon name="check" className="size-4" />
            <span className="font-semibold text-xs text-foreground">
              Private Asset
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Immutable provenance output
          </p>
        </div>
      </div>
    </div>
  );
}

function AssetLifecycleGraphic() {
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-5 shadow-xs">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <p className="font-mono text-xs font-bold uppercase tracking-wider text-foreground">
          30-Day Asset Lifecycle Timeline
        </p>
        <span className="font-mono text-[10px] text-warning font-semibold">
          Recoverable State
        </span>
      </div>

      <div className="relative mt-5 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-xl border border-border bg-background/60 p-3">
          <span className="font-mono text-[10px] font-bold uppercase text-success">
            Stage 1
          </span>
          <p className="mt-1 font-semibold text-foreground">Active Asset</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Full workspace availability
          </p>
        </div>

        <div className="rounded-xl border border-warning/30 bg-warning/10 p-3">
          <span className="font-mono text-[10px] font-bold uppercase text-warning">
            Stage 2
          </span>
          <p className="mt-1 font-semibold text-foreground">30-Day Trash</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Recoverable by tenant
          </p>
        </div>

        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3">
          <span className="font-mono text-[10px] font-bold uppercase text-destructive">
            Stage 3
          </span>
          <p className="mt-1 font-semibold text-foreground">Permanent Purge</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Byte & derivative deletion
          </p>
        </div>
      </div>
    </div>
  );
}
