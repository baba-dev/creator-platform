"use client";

import { useEffect, useState } from "react";

import { MascotScene } from "@/components/process/mascot-scene";

export default function WorkspaceLoading() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 350);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) {
    return <div className="min-h-[calc(100vh-64px)] bg-background" aria-hidden="true" />;
  }

  return (
    <main
      className="grid min-h-[calc(100vh-64px)] place-items-center bg-background px-5 py-12 text-foreground"
      aria-busy="true"
    >
      <div role="status" aria-live="polite" className="max-w-sm text-center">
        <MascotScene kind="running" size="modal" className="mx-auto" />
        <h1 className="font-display mt-5 text-xl font-semibold">
          Getting your workspace ready
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Loading the next creative surface without losing your place.
        </p>
      </div>
    </main>
  );
}
