import { randomUUID } from "node:crypto";
import { emptyContent } from "@aiwa/learn";
import { LearnEditor } from "@/components/learn/editor";
import { requirePlatformPermission } from "@/lib/request-auth";
export default async function Page() {
  await requirePlatformPermission("learn:manage");
  return <LearnEditor initial={emptyContent(randomUUID())} />;
}
