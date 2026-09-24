import { OrganizationDomainError } from "@aiwa/organizations";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function projectApiError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid project details.", issues: error.issues },
      { status: 400 },
    );
  }
  if (error instanceof OrganizationDomainError) {
    const status =
      error.code === "PROJECT_NOT_FOUND"
        ? 404
        : error.code === "PERMISSION_DENIED"
          ? 403
          : error.code === "ORGANIZATION_SUSPENDED"
            ? 409
            : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return NextResponse.json(
    { error: "Project operation failed." },
    { status: 500 },
  );
}
