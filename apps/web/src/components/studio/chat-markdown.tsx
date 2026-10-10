import type { ReactNode } from "react";

/**
 * Render the subset of Markdown needed for model answers as React elements.
 * Model text is never treated as HTML. Links are protocol-checked and all
 * other content is escaped by React (including HTML-looking model output).
 */
function safeHref(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:"].includes(url.protocol)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

const inlineTokens =
  /(\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|\[[^\]\n]+\]\([^\s)]+\)|\*[^*\n]+\*|_[^_\n]+_)/g;

function renderInline(value: string): ReactNode[] {
  const rendered: ReactNode[] = [];
  let previous = 0;
  for (const match of value.matchAll(inlineTokens)) {
    const index = match.index ?? 0;
    if (index > previous) rendered.push(value.slice(previous, index));
    const token = match[0];
    const key = index;
    if (token.startsWith("**") || token.startsWith("__")) {
      rendered.push(
        <strong key={key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("~~")) {
      rendered.push(<del key={key}>{token.slice(2, -2)}</del>);
    } else if (token.startsWith("`")) {
      rendered.push(
        <code
          key={key}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const href = link && safeHref(link[2]);
      rendered.push(
        href ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-2 break-all"
          >
            {link![1]}
          </a>
        ) : (
          token
        ),
      );
    } else {
      rendered.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    previous = index + token.length;
  }
  if (previous < value.length) rendered.push(value.slice(previous));
  return rendered;
}

const listLine = /^(\s*)([-*+]|\d+[.)])\s+(.+)$/;
const headerLine = /^(#{1,6})\s+(.+)$/;
const separatorLine = /^\s*(?:---+|\*\*\*+|___+)\s*$/;
const tableDivider = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;

function blockStart(line: string): boolean {
  return (
    /^\s*```/.test(line) ||
    Boolean(headerLine.exec(line)) ||
    Boolean(listLine.exec(line)) ||
    /^\s*>/.test(line) ||
    separatorLine.test(line)
  );
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function ChatMarkdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (!line.trim()) {
      index++;
      continue;
    }

    if (/^\s*```/.test(line)) {
      const language = line
        .trim()
        .slice(3)
        .trim()
        .replace(/[^a-zA-Z0-9_+-]/g, "")
        .slice(0, 24);
      const code: string[] = [];
      index++;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index]!))
        code.push(lines[index++]!);
      if (index < lines.length) index++;
      blocks.push(
        <div
          key={blocks.length}
          className="my-3 overflow-hidden rounded-xl border border-border bg-surface-sunken"
        >
          {language ? (
            <div className="border-b border-border px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
              {language}
            </div>
          ) : null}
          <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
            <code>{code.join("\n")}</code>
          </pre>
        </div>,
      );
      continue;
    }

    const heading = headerLine.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const className =
        level <= 2
          ? "mt-4 mb-2 text-base font-bold tracking-tight"
          : "mt-3 mb-1.5 text-sm font-bold";
      blocks.push(
        <div
          key={blocks.length}
          role="heading"
          aria-level={level}
          className={className}
        >
          {renderInline(heading[2]!)}
        </div>,
      );
      index++;
      continue;
    }

    if (separatorLine.test(line)) {
      blocks.push(<hr key={blocks.length} className="my-3 border-border" />);
      index++;
      continue;
    }

    if (
      index + 1 < lines.length &&
      line.includes("|") &&
      tableDivider.test(lines[index + 1]!)
    ) {
      const headings = cells(line);
      const rows: string[][] = [];
      index += 2;
      while (
        index < lines.length &&
        lines[index]!.trim() &&
        lines[index]!.includes("|")
      ) {
        rows.push(cells(lines[index++]!));
      }
      blocks.push(
        <div
          key={blocks.length}
          className="my-3 max-w-full overflow-x-auto rounded-lg border border-border"
        >
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-surface-sunken">
              <tr>
                {headings.map((cell, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="border-b border-border px-3 py-2 font-semibold"
                  >
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {headings.map((_, j) => (
                    <td key={j} className="px-3 py-2 align-top">
                      {renderInline(row[j] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index]!)) {
        quoted.push(lines[index++]!.replace(/^\s*>\s?/, ""));
      }
      blocks.push(
        <blockquote
          key={blocks.length}
          className="my-2 border-l-2 border-primary/40 pl-3 italic text-muted-foreground"
        >
          {quoted.map((part, i) => (
            <p key={i}>{renderInline(part)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }

    const firstList = listLine.exec(line);
    if (firstList) {
      const ordered = /^\d/.test(firstList[2]!);
      const entries: string[] = [];
      while (index < lines.length) {
        const item = listLine.exec(lines[index]!);
        if (!item || /^\d/.test(item[2]!) !== ordered) break;
        entries.push(item[3]!);
        index++;
      }
      const content = entries.map((entry, i) => (
        <li key={i} className="pl-0.5">
          {renderInline(entry)}
        </li>
      ));
      blocks.push(
        ordered ? (
          <ol
            key={blocks.length}
            className="my-2 list-outside list-decimal space-y-1 pl-5"
            start={Number.parseInt(firstList[2]!, 10)}
          >
            {content}
          </ol>
        ) : (
          <ul
            key={blocks.length}
            className="my-2 list-outside list-disc space-y-1 pl-5"
          >
            {content}
          </ul>
        ),
      );
      continue;
    }

    const paragraph = [line.trim()];
    index++;
    while (
      index < lines.length &&
      lines[index]!.trim() &&
      !blockStart(lines[index]!)
    ) {
      if (
        index + 1 < lines.length &&
        lines[index]!.includes("|") &&
        tableDivider.test(lines[index + 1]!)
      )
        break;
      paragraph.push(lines[index++]!.trim());
    }
    blocks.push(
      <p
        key={blocks.length}
        className="my-2 whitespace-normal leading-7 first:mt-0 last:mb-0"
      >
        {renderInline(paragraph.join(" "))}
      </p>,
    );
  }
  return (
    <div className="min-w-0 break-words text-sm text-foreground">{blocks}</div>
  );
}
