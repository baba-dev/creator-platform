import { createHash } from "node:crypto";
import { reserveAssetStorage } from "@aiwa/assets";
import {
  MAX_EDITED_IMAGE_BYTES,
  imageOperationRequestSchema,
  transformedDimensions,
} from "@aiwa/assets/image-operations";
import { createAssetObjectKey } from "@aiwa/assets/storage";
import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAssetMembership } from "@/lib/asset-api";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const body = await request.text();
  if (body.length > 4_096)
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  let input: z.infer<typeof imageOperationRequestSchema>;
  try {
    input = imageOperationRequestSchema.parse(JSON.parse(body));
  } catch {
    return NextResponse.json(
      { error: "Invalid image operation." },
      { status: 400 },
    );
  }
  if (!(await requireAssetMembership(session, input.organizationId, true)))
    return NextResponse.json(
      { error: "Workspace access denied." },
      { status: 403 },
    );

  const key = createHash("sha256")
    .update(
      `${input.organizationId}:${session.user.id}:${input.idempotencyKey}`,
    )
    .digest("hex");
  try {
    const operation = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Organization WHERE id = ${input.organizationId} FOR UPDATE`;
      const existing = await tx.imageOperation.findUnique({
        where: { idempotencyKey: key },
      });
      if (existing) {
        if (
          existing.organizationId !== input.organizationId ||
          existing.createdById !== session.user.id ||
          existing.sourceAssetId !== input.sourceAssetId ||
          JSON.stringify(existing.requestPayload) !==
            JSON.stringify({ transform: input.transform, format: input.format })
        )
          throw new Error("REQUEST_KEY_CONFLICT");
        return existing;
      }
      const source = await tx.asset.findFirst({
        where: {
          id: input.sourceAssetId,
          organizationId: input.organizationId,
          mediaKind: "IMAGE",
          status: "READY",
          storageProvider: "LOCAL",
        },
      });
      if (
        !source ||
        (source.purpose === "REFERENCE_INPUT" &&
          source.storageOwnerUserId !== session.user.id)
      )
        throw new Error("SOURCE_UNAVAILABLE");
      if (source.width && source.height)
        transformedDimensions(
          { width: source.width, height: source.height },
          input.transform,
        );
      await reserveAssetStorage(tx, {
        organizationId: input.organizationId,
        userId: session.user.id,
        proposedBytes: MAX_EDITED_IMAGE_BYTES,
      });
      const objectKey = createAssetObjectKey(
        input.organizationId,
        input.format === "jpeg" ? "jpg" : input.format,
      );
      const output = await tx.asset.create({
        data: {
          organizationId: input.organizationId,
          projectId: source.projectId,
          folderId: source.folderId,
          sourceAssetId: source.id,
          storageOwnerUserId: session.user.id,
          createdById: session.user.id,
          purpose:
            source.purpose === "REFERENCE_INPUT"
              ? "REFERENCE_INPUT"
              : "GENERAL",
          status: "PENDING",
          mediaKind: "IMAGE",
          sourceType: "DERIVED",
          storageProvider: "LOCAL",
          name: `${input.transform.kind} · ${source.name ?? "Image"}`.slice(
            0,
            191,
          ),
          objectKey,
          mimeType: `image/${input.format}`,
          byteSize: MAX_EDITED_IMAGE_BYTES,
        },
      });
      return tx.imageOperation.create({
        data: {
          organizationId: input.organizationId,
          createdById: session.user.id,
          sourceAssetId: source.id,
          outputAssetId: output.id,
          idempotencyKey: key,
          requestPayload: { transform: input.transform, format: input.format },
        },
      });
    });
    return NextResponse.json(
      {
        operationId: operation.id,
        outputAssetId: operation.outputAssetId,
        status: operation.status,
      },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_KEY_CONFLICT")
      return NextResponse.json(
        { error: "Request key was already used for different inputs." },
        { status: 409 },
      );
    if (error instanceof Error && error.message === "SOURCE_UNAVAILABLE")
      return NextResponse.json(
        { error: "Image is unavailable." },
        { status: 404 },
      );
    if (error instanceof Error && /dimensions|Crop/.test(error.message))
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof Error && /quota exceeded/i.test(error.message))
      return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json(
      { error: "Image editing is temporarily unavailable." },
      { status: 503 },
    );
  }
}

export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId") ?? "";
  const operationId = url.searchParams.get("operationId") ?? "";
  if (
    !organizationId ||
    !operationId ||
    !(await requireAssetMembership(session, organizationId))
  )
    return NextResponse.json(
      { error: "Operation unavailable." },
      { status: 404 },
    );
  const operation = await db.imageOperation.findFirst({
    where: { id: operationId, organizationId, createdById: session.user.id },
    select: { id: true, status: true, outputAssetId: true, errorMessage: true },
  });
  return operation
    ? NextResponse.json(operation, { headers: { "Cache-Control": "no-store" } })
    : NextResponse.json({ error: "Operation unavailable." }, { status: 404 });
}
