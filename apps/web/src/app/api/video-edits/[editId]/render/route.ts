import { createHash } from "node:crypto";
import { reserveAssetStorage } from "@aiwa/assets";
import {
  videoEditAssetIds,
  videoEditDocumentSchema,
} from "@aiwa/assets/video-edit";
import { createAssetObjectKey } from "@aiwa/assets/storage";
import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAssetMembership } from "@/lib/asset-api";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import { validateVideoSources } from "@/lib/video-edits";
import { safeErrorMessage } from "@/lib/safe-error";

type Context = { params: Promise<{ editId: string }> };
const inputSchema = z
  .object({
    organizationId: z.string().min(1).max(100),
    revision: z.number().int().positive(),
    idempotencyKey: z.uuid(),
  })
  .strict();
const RESERVED_BYTES = 300_000_000n;

export async function POST(request: Request, context: Context) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const text = await request.text();
  if (text.length > 1000)
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  let input: z.infer<typeof inputSchema>;
  try {
    input = inputSchema.parse(JSON.parse(text));
  } catch {
    return NextResponse.json(
      { error: "Invalid render request." },
      { status: 400 },
    );
  }
  if (!(await requireAssetMembership(session, input.organizationId, true)))
    return NextResponse.json(
      { error: "Workspace access denied." },
      { status: 403 },
    );
  const { editId } = await context.params;
  const key = createHash("sha256")
    .update(
      `${input.organizationId}:${session.user.id}:${input.idempotencyKey}`,
    )
    .digest("hex");
  try {
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Organization WHERE id = ${input.organizationId} FOR UPDATE`;
      const existing = await tx.videoRender.findUnique({
        where: { idempotencyKey: key },
      });
      if (existing) {
        if (
          existing.editId !== editId ||
          existing.revision !== input.revision ||
          existing.createdById !== session.user.id
        )
          throw new Error("Request key was reused.");
        return existing;
      }
      const edit = await tx.videoEdit.findFirst({
        where: {
          id: editId,
          organizationId: input.organizationId,
          createdById: session.user.id,
        },
      });
      if (!edit) throw new Error("Edit unavailable.");
      if (edit.revision !== input.revision)
        throw new Error("Save the latest edit before rendering.");
      const document = videoEditDocumentSchema.parse(edit.document);
      const sources = await validateVideoSources(
        input.organizationId,
        session.user.id,
        document,
        tx,
      );
      const ids = videoEditAssetIds(document);
      await reserveAssetStorage(tx, {
        organizationId: input.organizationId,
        userId: session.user.id,
        proposedBytes: RESERVED_BYTES,
      });
      const output = await tx.asset.create({
        data: {
          organizationId: input.organizationId,
          projectId: edit.projectId,
          sourceAssetId: document.clips[0]!.assetId,
          storageOwnerUserId: session.user.id,
          createdById: session.user.id,
          status: "PENDING",
          purpose: sources.some(
            (source) => source.purpose === "REFERENCE_INPUT",
          )
            ? "REFERENCE_INPUT"
            : "GENERAL",
          mediaKind: "VIDEO",
          sourceType: "DERIVED",
          storageProvider: "LOCAL",
          name: edit.title,
          objectKey: createAssetObjectKey(input.organizationId, "mp4"),
          mimeType: "video/mp4",
          byteSize: RESERVED_BYTES,
        },
      });
      return tx.videoRender.create({
        data: {
          editId,
          organizationId: input.organizationId,
          createdById: session.user.id,
          outputAssetId: output.id,
          idempotencyKey: key,
          revision: edit.revision,
          document: edit.document ?? {},
          inputs: { create: ids.map((assetId) => ({ assetId })) },
        },
      });
    });
    return NextResponse.json(
      {
        renderId: result.id,
        outputAssetId: result.outputAssetId,
        status: result.status,
      },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = safeErrorMessage(error, "Render unavailable.");
    const status = /quota|Request key|Save the latest/.test(message)
      ? 409
      : /unavailable/.test(message)
        ? 404
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
