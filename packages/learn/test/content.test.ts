import { describe, it, expect } from "vitest";
import {
  cleanHtml,
  articleHtml,
  mediaIds,
  publishIssues,
} from "../src/sanitize";
import { contentSchema, emptyContent } from "../src/content";
describe("Learn publishing boundaries", () => {
  it("removes active HTML, unsafe links, tracking images and arbitrary styles", () => {
    const html = cleanHtml(
      '<script>alert(1)</script><p onclick="attack()" style="color:red">Hello</p><a href="javascript:alert(1)">bad</a><img src="https://tracker.invalid/a"><iframe src="https://evil.invalid"></iframe><img src="/api/learn/media/abc" alt="Safe" onerror="attack()">',
    );
    expect(html).not.toMatch(
      /script|onclick|onerror|style=|tracker|iframe|javascript/,
    );
    expect(html).toContain("/api/learn/media/abc");
  });
  it("rejects protocol relative media and preserves safe audio controls", () => {
    expect(
      cleanHtml(
        '<img src="//evil.invalid"><audio src="/api/learn/media/audio-id" autoplay></audio>',
      ),
    ).toBe(
      '<audio src="/api/learn/media/audio-id" controls preload="metadata"></audio>',
    );
  });
  it("allows repository-owned editorial images without opening external tracking", () => {
    expect(
      cleanHtml(
        '<figure class="learn-media-portrait unsafe"><img src="/learn-assets/image-generation/final-blue-hour.webp" alt="Final image"></figure><img src="/learn-assets/../secret.png">',
      ),
    ).toBe(
      '<figure class="learn-media-portrait"><img src="/learn-assets/image-generation/final-blue-hour.webp" alt="Final image" loading="lazy" /></figure>',
    );
  });
  it("derives stable heading anchors and deduplicated media references", () => {
    const result = articleHtml(
      "<h2>Start <em>here</em></h2><h2>Start here</h2>",
    );
    expect(result.headings).toEqual([
      { id: "section-1", text: "Start here" },
      { id: "section-2", text: "Start here" },
    ]);
    const c = emptyContent("test");
    c.coverId = "abc";
    c.html =
      '<img src="/api/learn/media/abc"><video src="/api/learn/media/def"></video>';
    expect(mediaIds(c)).toEqual(["abc", "def"]);
  });
  it("allows drafts but requires meaningful publication fields", () => {
    const c = emptyContent("test");
    expect(contentSchema.safeParse(c).success).toBe(true);
    expect(publishIssues(c)).toHaveLength(5);
    expect(contentSchema.safeParse({ ...c, slug: "preview" }).success).toBe(
      false,
    );
    expect(
      contentSchema.safeParse({ ...c, tool: "//evil.invalid" }).success,
    ).toBe(false);
    expect(
      contentSchema.safeParse({
        ...c,
        coverSrc: "/learn-assets/image-generation/cover.webp",
      }).success,
    ).toBe(true);
    expect(
      contentSchema.safeParse({ ...c, coverSrc: "https://tracker.invalid/a" })
        .success,
    ).toBe(false);
  });
});
