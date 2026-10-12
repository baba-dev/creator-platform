import type { Metadata, Route } from "next";
import { db } from "@aiwa/db";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ToolsHeader } from "@/components/marketing/tools/tools-shell";
import { getRequestSession } from "@/lib/request-auth";
import { publicToolById } from "@/lib/public-tools";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function ToolStart({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tool = publicToolById(id);
  if (!tool) notFound();
  const route = "/tools/start/" + tool.id;
  const session = await getRequestSession();
  if (!session) return <main className="min-h-screen bg-background text-foreground"><ToolsHeader /><section className="mx-auto max-w-2xl px-5 py-24"><p className="font-mono text-xs font-bold uppercase tracking-widest text-primary">Your creative starting point</p><h1 className="font-display mt-5 text-4xl font-semibold">Continue to {tool.title}.</h1><p className="mt-5 text-sm leading-7 text-muted-foreground">Create an account or sign in to open this tool in your workspace. No generation is submitted and no credits are charged by this page.</p><div className="mt-8 flex flex-wrap gap-3"><Link className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground" href={("/sign-up?returnTo=" + encodeURIComponent(route)) as Route}>Create an account</Link><Link className="rounded-xl border border-border px-6 py-3 text-sm font-bold" href={("/sign-in?returnTo=" + encodeURIComponent(route)) as Route}>Sign in</Link></div></section></main>;
  const membership = await db.membership.findFirst({ where: { userId: session.user.id, organization: { status: "ACTIVE" } }, select: { organization: { select: { slug: true } } }, orderBy: { createdAt: "asc" } });
  if (!membership) redirect(("/onboarding?returnTo=" + encodeURIComponent(route)) as Route);
  redirect(("/app/" + encodeURIComponent(membership.organization.slug) + "/" + tool.segment) as Route);
}
