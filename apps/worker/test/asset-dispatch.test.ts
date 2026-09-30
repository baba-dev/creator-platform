import { describe, expect, it } from "vitest";
import { assetJobOptions, retainFailedAssetJob } from "../src/asset-dispatch";
describe("legacy delivery retention", () => {
  it("retains failed legacy deliveries for import", () => {
    const job = { opts: { removeOnFail: true } };
    retainFailedAssetJob(job);
    expect(job.opts.removeOnFail).toBe(false);
    expect(assetJobOptions.removeOnFail).toBe(false);
  });
});
