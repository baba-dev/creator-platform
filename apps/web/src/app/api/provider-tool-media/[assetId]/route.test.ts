import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { issueProviderToolMediaGrant } from "@aiwa/generation/provider-media-grant";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  root: "",
  db: { providerToolInputAsset: { findUnique: vi.fn() } },
}));
vi.mock("@aiwa/db", () => ({ db: mocks.db }));
vi.mock("@aiwa/config", () => ({
  parseServerEnv: () => ({
    AUTH_SECRET: "test-secret-for-provider-tool-media-32-chars",
    ASSET_STORAGE_ROOT: mocks.root,
  }),
}));

import { GET, HEAD } from "./route";

const secret = "test-secret-for-provider-tool-media-32-chars";
const key = "org/org1/assets/12/source.mp4";
let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "provider-tool-media-test-"));
  mocks.root = root;
  await mkdir(dirname(join(root, key)), { recursive: true });
  await writeFile(join(root, key), Buffer.from("test-video-bytes"));
});

afterAll(async () => rm(root, { recursive: true, force: true }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.providerToolInputAsset.findUnique.mockResolvedValue({
    role: "SOURCE_VIDEO",
    position: 0,
    asset: {
      id: "asset1",
      organizationId: "org1",
      status: "READY",
      storageProvider: "LOCAL",
      mediaKind: "VIDEO",
      mimeType: "video/mp4",
      purpose: "REFERENCE_INPUT",
      storageOwnerUserId: "owner1",
      objectKey: key,
      externalFileId: null,
    },
    execution: {
      organizationId: "org1",
      createdById: "owner1",
      status: "SUBMITTING",
    },
  });
});

function validGrant() {
  return issueProviderToolMediaGrant({
    secret,
    executionId: "execution1",
    assetId: "asset1",
  });
}

function url(grant: string) {
  return `https://example.com/api/provider-tool-media/asset1?executionId=execution1&grant=${grant}`;
}

const context = { params: Promise.resolve({ assetId: "asset1" }) };

describe("provider tool media retrieval", () => {
  it("serves only correctly snapshotted image and audio roles", async () => {
    const row = await mocks.db.providerToolInputAsset.findUnique();
    for (const media of [
      {
        role: "SOURCE_IMAGE",
        position: 0,
        mediaKind: "IMAGE",
        mimeType: "image/png",
      },
      {
        role: "SOURCE_AUDIO",
        position: 1,
        mediaKind: "AUDIO",
        mimeType: "audio/mpeg",
      },
    ]) {
      mocks.db.providerToolInputAsset.findUnique.mockResolvedValueOnce({
        ...row,
        role: media.role,
        position: media.position,
        asset: {
          ...row.asset,
          mediaKind: media.mediaKind,
          mimeType: media.mimeType,
        },
      });
      const response = await HEAD(new Request(url(validGrant())), context);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(media.mimeType);
    }
    mocks.db.providerToolInputAsset.findUnique.mockResolvedValueOnce({
      ...row,
      role: "SOURCE_IMAGE",
      asset: { ...row.asset, mediaKind: "AUDIO", mimeType: "audio/mpeg" },
    });
    expect((await GET(new Request(url(validGrant())), context)).status).toBe(
      404,
    );
  });
  it("rejects unsigned requests before touching persistence", async () => {
    const response = await GET(new Request(url("bad")), context);
    expect(response.status).toBe(404);
    expect(mocks.db.providerToolInputAsset.findUnique).not.toHaveBeenCalled();
  });

  it("rejects revoked, cross-tenant and other-user sources", async () => {
    const grant = validGrant();
    const row = await mocks.db.providerToolInputAsset.findUnique();
    for (const patch of [
      { asset: { ...row.asset, organizationId: "org2" } },
      { asset: { ...row.asset, storageOwnerUserId: "other" } },
      { role: "OTHER_INPUT" },
      { position: 1 },
      { asset: { ...row.asset, mimeType: "video/webm" } },
      { execution: { ...row.execution, status: "FAILED" } },
    ]) {
      mocks.db.providerToolInputAsset.findUnique.mockResolvedValueOnce({
        ...row,
        ...patch,
      });
      expect((await GET(new Request(url(grant)), context)).status).toBe(404);
    }
  });

  it("supports bounded ranges and HEAD only while execution is active", async () => {
    const response = await GET(
      new Request(url(validGrant()), { headers: { range: "bytes=0-3" } }),
      context,
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 0-3/16");
    expect(await response.text()).toBe("test");

    const head = await HEAD(new Request(url(validGrant())), context);
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    expect(head.headers.get("Content-Length")).toBe("16");
  });
});
