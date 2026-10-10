import type { Metadata } from "next";
import { LearnArchive } from "@/components/learn/archive";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<Metadata> {
  const q = await searchParams;
  return {
    title: "Learn: guides, ideas & answers",
    description:
      "Practical AI image, video and voice tutorials, product guides and creative inspiration from Aiwa Creators.",
    alternates: { canonical: "/learn" },
    robots: { index: !Object.values(q).some(Boolean), follow: true },
  };
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    topic?: string;
    page?: string;
    locale?: string;
  }>;
}) {
  const p = await searchParams;
  return (
    <LearnArchive
      q={p.q?.slice(0, 120)}
      topic={p.topic}
      locale={p.locale}
      page={Math.max(1, Math.min(1000, Number(p.page) || 1))}
    />
  );
}
