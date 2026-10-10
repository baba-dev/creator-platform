import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatMarkdown } from "./chat-markdown";

describe("ChatMarkdown", () => {
  it("formats AI prose, headings, lists, inline emphasis and tables", () => {
    const html = renderToStaticMarkup(
      <ChatMarkdown content={"### How to plan\n\n**Start here** with *ideas*.\n- First\n- Second\n\n| Name | Value |\n| --- | --- |\n| Oman | Muscat |"} />,
    );
    expect(html).toContain('role="heading"');
    expect(html).toContain("<strong");
    expect(html).toContain("<em");
    expect(html).toContain("<ul");
    expect(html).toContain("<table");
    expect(html).not.toContain("### How to plan");
  });

  it("renders model output safely without arbitrary HTML or unsafe links", () => {
    const html = renderToStaticMarkup(
      <ChatMarkdown content={'<img src=x onerror=alert(1)>\n\n[click](javascript:alert(1))\n\n[docs](https://example.com)'} />,
    );
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("shows fenced code as text rather than executing it", () => {
    const html = renderToStaticMarkup(
      <ChatMarkdown content={"```html\n<script>alert('unsafe')</script>\n```"} />,
    );
    expect(html).toContain("<pre");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
