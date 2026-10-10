import { notFound } from "next/navigation";
import { learnTopics } from "@aiwa/learn/content";
import { LearnArchive } from "@/components/learn/archive";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic } = await params;
  return {
    title: `${topic.replaceAll("-", " ")} guides`,
    alternates: { canonical: `/learn/topics/${topic}` },
    robots: { index: true, follow: true },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic } = await params;
  if (!learnTopics.includes(topic as (typeof learnTopics)[number])) notFound();
  return <LearnArchive topic={topic} />;
}
