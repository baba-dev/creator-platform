import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";

const targets = new Set(["image", "video", "assets"]);
export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("target");
  if (!target || !targets.has(target)) return NextResponse.redirect(new URL("/app", url));
  const session = await getRequestSession(request.headers);
  if (!session) return NextResponse.redirect(new URL("/sign-in?returnTo=" + encodeURIComponent("/pwa/launch?target=" + target), url));
  const membership = await db.membership.findFirst({
    where: { userId: session.user.id, organization: { status: "ACTIVE", ...(session.session.activeOrganizationId ? { id: session.session.activeOrganizationId } : {}) } },
    select: { organization: { select: { slug: true } } }
  }) ?? await db.membership.findFirst({
    where: { userId: session.user.id, organization: { status: "ACTIVE" } },
    orderBy: { createdAt: "asc" },
    select: { organization: { select: { slug: true } } }
  });
  if (!membership) return NextResponse.redirect(new URL("/onboarding", url));
  return NextResponse.redirect(new URL("/app/" + membership.organization.slug + "/" + target, url));
}
