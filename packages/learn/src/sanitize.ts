import sanitizeHtml from "sanitize-html";
import { isEditorialAssetPath, type LearnContent } from "./content";
export function cleanHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "h2",
      "h3",
      "h4",
      "strong",
      "em",
      "s",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "a",
      "img",
      "figure",
      "figcaption",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "hr",
      "video",
      "audio",
    ],
    allowedAttributes: {
      a: ["href", "title", "rel"],
      img: ["src", "alt", "width", "height", "loading"],
      video: ["src", "controls", "preload"],
      audio: ["src", "controls", "preload"],
      figure: ["class"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
    },
    allowedClasses: {
      figure: ["learn-media-wide", "learn-media-portrait"],
    },
    allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, a) => ({
        tagName: "a",
        attribs: {
          href: a.href ?? "",
          rel: "noopener noreferrer",
          ...(a.title ? { title: a.title } : {}),
        },
      }),
      img: (_tag, a) => ({
        tagName: "img",
        attribs: { ...a, loading: "lazy" },
      }),
      video: (_tag, a) => ({
        tagName: "video",
        attribs: { src: a.src ?? "", controls: "", preload: "metadata" },
      }),
      audio: (_tag, a) => ({
        tagName: "audio",
        attribs: { src: a.src ?? "", controls: "", preload: "metadata" },
      }),
    },
    exclusiveFilter: (frame) =>
      ["img", "video", "audio"].includes(frame.tag) &&
      !/^\/api\/learn\/media\/[a-zA-Z0-9_-]{1,100}$/.test(
        frame.attribs.src ?? "",
      ) &&
      !(frame.tag === "img" && isEditorialAssetPath(frame.attribs.src ?? "")),
  });
}
export function plainText(html: string) {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function mediaIds(content: LearnContent) {
  return [
    ...new Set(
      [
        content.coverId,
        content.socialImageId,
        ...Array.from(
          content.html.matchAll(/\/api\/learn\/media\/([a-zA-Z0-9_-]{1,100})/g),
          (m) => m[1]!,
        ),
      ].filter(Boolean),
    ),
  ];
}
export function publishIssues(c: LearnContent) {
  return [
    !c.title.trim() && "Add a title.",
    !c.excerpt.trim() && "Add an excerpt.",
    !c.author.trim() && "Add an author.",
    !c.coverId && !c.coverSrc && "Choose a cover image.",
    !c.coverAlt.trim() && "Describe the cover image.",
    plainText(c.html).length < 80 &&
      "Add a useful article body (at least 80 characters).",
    !!c.tool && !c.ctaLabel.trim() && "Add a call-to-action label.",
  ].filter(Boolean) as string[];
}
export function articleHtml(html: string) {
  let index = 0;
  const headings: { id: string; text: string }[] = [];
  const safe = cleanHtml(html).replace(
    /<(h[23])>([\s\S]*?)<\/\1>/g,
    (_match, tag: string, inner: string) => {
      const id = `section-${++index}`;
      headings.push({ id, text: plainText(inner) });
      return `<${tag} id="${id}">${inner}</${tag}>`;
    },
  );
  return { html: safe, headings };
}
