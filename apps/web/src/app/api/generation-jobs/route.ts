import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";
import {
  historyQuerySchema,
  listGenerationHistory,
} from "@/lib/generation-history";

export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const input = historyQuerySchema.safeParse(
    Object.fromEntries(
      [...new URL(request.url).searchParams].filter(
        ([, value]) => value !== "",
      ),
    ),
  );
  if (!input.success)
    return NextResponse.json(
      { error: "Invalid history filters." },
      { status: 400 },
    );
  try {
    const result = await listGenerationHistory(input.data, session.user.id);
    if (!result)
      return NextResponse.json(
        { error: "Workspace not found." },
        { status: 404 },
      );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid history cursor." },
      { status: 400 },
    );
  }
}
