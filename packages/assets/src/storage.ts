import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export interface StoredAssetObject {
  readonly byteSize: bigint;
  readonly sha256: string;
}

export interface AssetObjectStat {
  readonly byteSize: bigint;
}

export interface AssetStorage {
  readonly provider: "LOCAL" | "S3" | "GOOGLE_DRIVE" | "ONEDRIVE";
  put(objectKey: string, bytes: Buffer): Promise<StoredAssetObject>;
  read(objectKey: string): Promise<Buffer>;
  readRange(objectKey: string, start: number, end: number): Promise<Buffer>;
  stat(objectKey: string): Promise<AssetObjectStat>;
  delete(objectKey: string): Promise<void>;
}

/**
 * Object keys are deliberately opaque and independent from user filenames.
 * The first two digest characters distribute objects across directories while
 * preserving deterministic organization scoping for operations.
 */
export function createAssetObjectKey(
  organizationId: string,
  extension: string,
): string {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(organizationId))
    throw new Error("Invalid organization identifier.");
  const safeExtension = extension.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!safeExtension || safeExtension.length > 8)
    throw new Error("Invalid asset extension.");
  const id = randomUUID().replaceAll("-", "");
  return `org/${organizationId}/assets/${id.slice(0, 2)}/${id}.${safeExtension}`;
}

/**
 * Resolve an object key below a configured root while preventing absolute
 * paths, traversal, NUL bytes and path-prefix confusion.
 */
export function resolveLocalAssetPath(root: string, objectKey: string): string {
  if (!root.trim()) throw new Error("Asset storage root is not configured.");
  if (
    !objectKey ||
    objectKey.includes("\0") ||
    isAbsolute(objectKey) ||
    objectKey.split(/[\\/]/).some((part) => part === ".." || part === "")
  ) {
    throw new Error("Invalid asset object key.");
  }
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, objectKey);
  const rel = relative(resolvedRoot, target);
  if (!rel || rel.startsWith("..") || isAbsolute(rel))
    throw new Error("Invalid asset object key.");
  return target;
}

export class LocalAssetStorage implements AssetStorage {
  readonly provider = "LOCAL" as const;

  constructor(private readonly root: string) {}

  private path(objectKey: string): string {
    return resolveLocalAssetPath(this.root, objectKey);
  }

  async put(objectKey: string, bytes: Buffer): Promise<StoredAssetObject> {
    const target = this.path(objectKey);
    await mkdir(dirname(target), { recursive: true });
    const temp = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, bytes, { flag: "wx", mode: 0o600 });
      await rename(temp, target);
    } finally {
      await rm(temp, { force: true }).catch(() => undefined);
    }
    return {
      byteSize: BigInt(bytes.byteLength),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }

  async read(objectKey: string): Promise<Buffer> {
    return readFile(this.path(objectKey));
  }

  async readRange(objectKey: string, start: number, end: number): Promise<Buffer> {
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start
    ) {
      throw new RangeError("Invalid asset byte range.");
    }
    const length = end - start + 1;
    const file = await open(this.path(objectKey), "r");
    try {
      const result = Buffer.alloc(length);
      const { bytesRead } = await file.read(result, 0, length, start);
      return result.subarray(0, bytesRead);
    } finally {
      await file.close();
    }
  }

  async stat(objectKey: string): Promise<AssetObjectStat> {
    const info = await stat(this.path(objectKey));
    return { byteSize: BigInt(info.size) };
  }

  async delete(objectKey: string): Promise<void> {
    await rm(this.path(objectKey), { force: true });
  }
}
