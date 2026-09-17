export default function AdminLoading() {
  return (
    <div
      className="animate-pulse px-4 py-9 sm:px-7 lg:px-9"
      role="status"
      aria-label="Loading administration overview"
    >
      <div className="h-10 w-72 rounded-xl bg-muted" />
      <div className="mt-3 h-4 w-full max-w-xl rounded bg-muted" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="h-36 rounded-2xl border border-border bg-card"
          />
        ))}
      </div>
      <div className="mt-6 h-96 rounded-3xl border border-border bg-card" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
