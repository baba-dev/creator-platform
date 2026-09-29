import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { renderEditedImage } from "../src/image-render";

describe("durable image transform bytes", () => {
  it("crops, resizes and resamples into decodable output", async () => {
    const source = await sharp({
      create: { width: 120, height: 80, channels: 3, background: "#ee6688" },
    })
      .png()
      .toBuffer();
    const crop = await renderEditedImage(source, {
      transform: { kind: "crop", x: 10, y: 5, width: 35, height: 20 },
      format: "png",
    });
    expect(await sharp(crop.data).metadata()).toMatchObject({
      width: 35,
      height: 20,
      format: "png",
    });
    const down = await renderEditedImage(source, {
      transform: { kind: "resize", width: 60, height: 40, fit: "fill" },
      format: "jpeg",
    });
    expect(await sharp(down.data).metadata()).toMatchObject({
      width: 60,
      height: 40,
      format: "jpeg",
    });
    const up = await renderEditedImage(source, {
      transform: { kind: "scale", factor: 2 },
      format: "webp",
    });
    expect(await sharp(up.data).metadata()).toMatchObject({
      width: 240,
      height: 160,
      format: "webp",
    });
  });

  it("rejects an out-of-bounds crop before encoding", async () => {
    const source = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    await expect(
      renderEditedImage(source, {
        transform: { kind: "crop", x: 90, y: 1, width: 20, height: 20 },
        format: "png",
      }),
    ).rejects.toThrow(/Crop/);
  });
});
