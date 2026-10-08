import { AsyncLocalStorage } from "node:async_hooks";

/** Scope native media thread limits to every decoder, filter graph and encoder. */
export function boundedMediaArgs(
  binary: string,
  args: readonly string[],
  threads: number,
): string[] {
  if (binary === "ffprobe") return ["-threads", String(threads), ...args];
  if (binary !== "ffmpeg") return [...args];
  const bounded = [
    "-filter_threads",
    String(threads),
    "-filter_complex_threads",
    String(threads),
  ];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "-i" || index === args.length - 1)
      bounded.push("-threads", String(threads));
    bounded.push(args[index]!);
  }
  return bounded;
}

// One native media operation at a time in this process, including generation
// validation. The asset queue also has a Redis global concurrency limit.
let sharedGate: <T>(operation: () => Promise<T>) => Promise<T> = async (
  operation,
) => operation();
export function configureMediaCapacityGate(gate: typeof sharedGate): void {
  sharedGate = gate;
}
const ownership = new AsyncLocalStorage<boolean>();
let tail: Promise<void> = Promise.resolve();

/** Reentrant so a render may probe/encode without waiting on its own permit. */
export async function withMediaCapacity<T>(
  operation: () => Promise<T>,
): Promise<T> {
  if (ownership.getStore()) return operation();
  const previous = tail;
  let release!: () => void;
  tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await ownership.run(true, () => sharedGate(operation));
  } finally {
    release();
  }
}
