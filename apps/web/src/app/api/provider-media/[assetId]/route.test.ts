import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { issueProviderMediaGrant } from "@aiwa/generation/provider-media-grant";
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
  db: { generationInputAsset: { findUnique: vi.fn() } },
}));
vi.mock("@aiwa/db", () => ({ db: mocks.db }));
vi.mock("@aiwa/config", () => ({
  parseServerEnv: () => ({
    AUTH_SECRET: "test-secret-for-provider-media-at-least-32-chars",
    ASSET_STORAGE_ROOT: mocks.root,
  }),
}));

import { GET, HEAD } from "./route";

const secret = "test-secret-for-provider-media-at-least-32-chars";
const key = "org/org1/assets/12/source.mp4";
let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "provider-media-test-"));
  mocks.root = root;
  await mkdir(dirname(join(root, key)), { recursive: true });
  await writeFile(join(root, key), Buffer.from("test-video-bytes"));
});
afterAll(async () => rm(root, { recursive: true, force: true }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.generationInputAsset.findUnique.mockResolvedValue({
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
    },
    generationJob: {
      id: "job1",
      organizationId: "org1",
      createdById: "owner1",
      status: "PROCESSING",
    },
  });
});

function url(grant: string) {
  return `https://example.com/api/provider-media/asset1?jobId=job1&grant=${grant}`;
}
function validGrant() {
  return issueProviderMediaGrant({ secret, jobId: "job1", assetId: "asset1" });
}
const context = { params: Promise.resolve({ assetId: "asset1" }) };

describe("provider media retrieval", () => {
  it("denies an unsigned URL without looking up the asset", async () => {
    expect((await GET(new Request(url("bad")), context)).status).toBe(404);
    expect(mocks.db.generationInputAsset.findUnique).not.toHaveBeenCalled();
  });

  it("denies cross-tenant, revoked and other-user sources", async () => {
    const grant = validGrant();
    const row = await mocks.db.generationInputAsset.findUnique();
    for (const patch of [
      { asset: { ...row.asset, organizationId: "org2" } },
      { asset: { ...row.asset, storageOwnerUserId: "other" } },
      { generationJob: { ...row.generationJob, status: "CANCELLED" } },
    ]) {
      mocks.db.generationInputAsset.findUnique.mockResolvedValueOnce({
        ...row,
        ...patch,
      });
      expect((await GET(new Request(url(grant)), context)).status).toBe(404);
    }
  });

  it("streams bounded ranges and supports a metadata-only HEAD", async () => {
    const request = new Request(url(validGrant()), {
      headers: { range: "bytes=0-3" },
    });
    const response = await GET(request, context);
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 0-3/16");
    expect(await response.text()).toBe("test");
    const head = await HEAD(new Request(url(validGrant())), context);
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    expect(head.headers.get("Content-Length")).toBe("16");
  });
});
