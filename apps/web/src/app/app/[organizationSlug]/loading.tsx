import { MascotScene } from "@/components/process/mascot-scene";

export default function WorkspaceLoading() {
  return (
    <main
      className="grid min-h-[calc(100vh-64px)] place-items-center bg-background px-5 py-12 text-foreground"
      aria-busy="true"
    >
      <div role="status" className="max-w-sm text-center">
        <MascotScene kind="running" size="modal" className="mx-auto" />
        <h1 className="font-display mt-5 text-xl font-semibold">
          Getting your workspace ready
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Loading the next creative surface. This message only appears when the
          transition takes long enough to notice.
        </p>
      </div>
    </main>
  );
}
