import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

const assetUrl = new URL("../../public/brand/pixel/", import.meta.url);
const content = (file: string) =>
  readFileSync(new URL(file, assetUrl), "utf8");

const manifest = JSON.parse(content("manifest.json")) as {
  version: string;
  master: string;
  staticFallback: string;
  heroOutline: string;
  expressionIds: string[];
  poseIds: string[];
};

const variants = [
  manifest.master,
  manifest.staticFallback,
  manifest.heroOutline,
  "pixel-face-rig.svg",
  "pixel-laptop-companion.svg",
  ...manifest.expressionIds.map((id) => `expressions/pixel-${id}.svg`),
  ...manifest.poseIds.map((id) => `poses/pixel-${id}.svg`),
];

describe("Pixel Phase A2 artwork exports", () => {
  it("keeps checked-in SVG exports deterministic", () => {
    const script = fileURLToPath(
      new URL("../../scripts/build-pixel-phase-a2.mjs", import.meta.url),
    );
    const run = spawnSync(process.execPath, [script, "--check"], {
      encoding: "utf8",
    });
    expect(run.status, run.stderr || run.stdout).toBe(0);
  });

  it("declares a complete canonical static asset set", () => {
    expect(manifest.version).toBe("phase-a2");
    expect(manifest.expressionIds).toHaveLength(10);
    expect(manifest.poseIds).toHaveLength(8);
    expect(new Set(variants).size).toBe(23);
  });

  it.each(variants)(
    "%s is a self-contained, labelled, vector-only SVG",
    (file) => {
      const svg = content(file);
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      expect(svg).toContain('viewBox="0 0 720 520"');
      expect(svg).toContain('<title id="pixel-title">');
      expect(svg).toContain('<desc id="pixel-description">');
      expect(svg).toContain("</svg>");
      expect(svg).toContain("<path ");
      expect(svg).not.toMatch(
        /<image\b|data:image|<script\b|<foreignObject\b|<animate\b|onload=|<style\b/i,
      );
      expect(svg).not.toMatch(/(?:href|src)=["'](?:https?:)?\/\//i);
      for (const match of svg.matchAll(/<path\b[^>]*\/>/g)) {
        expect([...match[0].matchAll(/\sfill=/g)].length).toBeLessThanOrEqual(1);
      }
    },
  );

  it("preserves independently addressable anatomy and facial features", () => {
    const master = content(manifest.master);
    for (const id of [
      "pixel-character",
      "pixel-head",
      "pixel-ear-left",
      "pixel-ear-right",
      "pixel-tail",
      "pixel-paws",
      "pixel-feet",
      "pixel-eyes",
      "pixel-eye-left",
      "pixel-eye-right",
      "pixel-pupil-left",
      "pixel-pupil-right",
      "pixel-mouth",
      "pixel-whiskers",
    ]) {
      expect(master).toContain(`id="${id}"`);
    }
    const outline = content(manifest.heroOutline);
    expect(outline).toContain('pathLength="1"');
    expect(outline).toContain('data-pencil-order="1"');
    expect(outline).toContain('data-pencil-order="12"');
    expect(outline).not.toContain("<image");
  });

  it("renders representative exports without external requests", async () => {
    for (const file of [
      manifest.master,
      manifest.staticFallback,
      manifest.heroOutline,
      "expressions/pixel-eye-roll.svg",
      "poses/pixel-bump-up-jump.svg",
      "poses/pixel-hover-wave.svg",
    ]) {
      const image = sharp(Buffer.from(content(file)), { density: 96 });
      const metadata = await image.metadata();
      expect(metadata.width).toBe(720);
      expect(metadata.height).toBe(520);
      const rendered = await image.png().toBuffer();
      expect(rendered.length).toBeGreaterThan(1000);
    }
  });
});
