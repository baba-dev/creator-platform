"use client";
import { useState } from "react";
export function ArticleActions({ prompt }: { prompt: string }) {
  const [message, setMessage] = useState("");
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Copied to clipboard.");
    } catch {
      setMessage("Copy unavailable. Select and copy the text manually.");
    }
  }
  return (
    <div className="mt-8 space-y-3">
      {prompt && (
        <div className="rounded-2xl border border-border bg-muted p-5">
          <p className="text-sm font-semibold">Try this prompt</p>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-7">
            {prompt}
          </pre>
          <button
            onClick={() => void copy(prompt)}
            className="mt-3 min-h-10 text-sm font-semibold text-primary"
          >
            Copy prompt
          </button>
        </div>
      )}
      <button
        onClick={() => void copy(window.location.href)}
        className="min-h-10 text-sm font-semibold text-primary"
      >
        Copy article link
      </button>
      <p role="status" className="text-xs text-muted-foreground">
        {message}
      </p>
    </div>
  );
}
