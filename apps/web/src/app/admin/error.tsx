"use client";

import { Button } from "@/components/ui/button";

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-5">
      <div className="max-w-md rounded-3xl border border-destructive/25 bg-card p-8 text-center shadow-sm">
        <h1 className="font-display text-2xl font-semibold">
          The overview could not be loaded
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          No changes were made. Try the request again, or check the platform
          logs if the problem continues.
        </p>
        <Button className="mt-6" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
