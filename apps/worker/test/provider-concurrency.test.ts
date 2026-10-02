import { describe, expect, it } from "vitest";

import { seedanceConcurrencySpec } from "../src/provider-concurrency";

describe("Seedance provider concurrency policy", () => {
  it("ignores unrelated providers", () => {
    expect(
      seedanceConcurrencySpec({
        providerModelId: "other-video-model",
        capabilities: { concurrencyLimit: 10 },
        requestPayload: { resolution: "720p" },
      }),
    ).toBeNull();
  });

  it("keeps operating headroom below a ten-task provider ceiling", () => {
    expect(
      seedanceConcurrencySpec({
        providerModelId: "dreamina-seedance-2-5-260628",
        capabilities: { concurrencyLimit: 10 },
        requestPayload: { resolution: "1080p" },
      }),
    ).toEqual({
      key: "aiwa:provider-capacity:byteplus:dreamina-seedance-2-5-260628:standard",
      limit: 8,
    });
  });

  it("hard-caps standard Seedance 2.0 4K to one concurrent provider task", () => {
    expect(
      seedanceConcurrencySpec({
        providerModelId: "dreamina-seedance-2-0-260128",
        capabilities: { concurrencyLimit: 10, concurrencyLimit4K: 1 },
        requestPayload: { resolution: "4K" },
      }),
    ).toEqual({
      key: "aiwa:provider-capacity:byteplus:dreamina-seedance-2-0-260128:4k",
      limit: 1,
    });
  });

  it("derives conservative operating capacity from future descriptor changes", () => {
    expect(
      seedanceConcurrencySpec({
        providerModelId: "dreamina-seedance-2-0-fast-260128",
        capabilities: { concurrencyLimit: 6 },
        requestPayload: { resolution: "720p" },
      })?.limit,
    ).toBe(4);
  });
  it("uses a conservative single-task OmniHuman operating limit", () => {
    expect(
      seedanceConcurrencySpec({
        providerModelId: "omnihuman-1.5",
        capabilities: { concurrencyLimit: 1 },
        requestPayload: {
          schemaVersion: 2,
          workflow: "TALKING_AVATAR",
          resolution: "1080p",
        },
      }),
    ).toEqual({
      key: "aiwa:provider-capacity:byteplus:omnihuman-1.5:standard",
      limit: 1,
    });
  });
});
