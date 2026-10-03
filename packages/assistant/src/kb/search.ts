import features from "./features.json" with { type: "json" };
import errors from "./errors.json" with { type: "json" };
import faq from "./faq.json" with { type: "json" };

export interface KbChunk {
  type: "feature" | "error" | "faq";
  title: string;
  content: string;
  route?: string;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function score(tokens: string[], candidate: string[]): number {
  return tokens.filter((t) =>
    candidate.some((c) => c.includes(t) || t.includes(c)),
  ).length;
}

export function searchKnowledgebase(query: string, topK = 3): KbChunk[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const candidates: Array<{ chunk: KbChunk; score: number }> = [];

  for (const f of features as Array<{
    key: string;
    title: string;
    summary: string;
    route: string;
    keywords: string[];
  }>) {
    const kw = tokenize(f.keywords.join(" ") + " " + f.title);
    const s = score(queryTokens, kw);
    if (s > 0) {
      candidates.push({
        chunk: {
          type: "feature",
          title: f.title,
          content: f.summary,
          route: f.route,
        },
        score: s,
      });
    }
  }

  for (const e of errors as Array<{
    pattern: string;
    title: string;
    explanation: string;
    remediation: string;
    keywords: string[];
  }>) {
    const kw = tokenize(e.keywords.join(" ") + " " + e.title);
    const s = score(queryTokens, kw);
    if (s > 0) {
      candidates.push({
        chunk: {
          type: "error",
          title: e.title,
          content: `${e.explanation} Remediation: ${e.remediation}`,
        },
        score: s,
      });
    }
  }

  for (const f of faq as Array<{
    q: string;
    a: string;
    keywords: string[];
  }>) {
    const kw = tokenize(f.keywords.join(" ") + " " + f.q);
    const s = score(queryTokens, kw);
    if (s > 0) {
      candidates.push({
        chunk: { type: "faq", title: f.q, content: f.a },
        score: s,
      });
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((c) => c.chunk);
}
