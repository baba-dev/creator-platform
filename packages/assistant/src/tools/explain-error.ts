import { z } from "zod";
import type { AssistantTool } from "./types";
import errors from "../kb/errors.json" with { type: "json" };

const inputSchema = z.object({
  errorMessage: z.string().min(1).max(2000),
});

type ErrorEntry = {
  pattern: string;
  title: string;
  explanation: string;
  remediation: string;
  keywords: string[];
};

export const explainErrorTool: AssistantTool<z.infer<typeof inputSchema>> = {
  description: "Explain an error message in plain language",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>) {
    const lower = input.errorMessage.toLowerCase();
    const match = (errors as ErrorEntry[]).find(
      (e) =>
        lower.includes(e.pattern.toLowerCase()) ||
        e.keywords.some((k) => lower.includes(k.toLowerCase())),
    );
    if (match) {
      return {
        found: true,
        title: match.title,
        explanation: match.explanation,
        remediation: match.remediation,
      };
    }
    return {
      found: false,
      title: "Uncatalogued System Issue",
      explanation: `Error details: "${input.errorMessage}". This doesn't match a standard known issue pattern.`,
      remediation:
        "Please check the generation logs. If the issue persists, use the 'Escalate to Support' quick action.",
    };
  },
};
