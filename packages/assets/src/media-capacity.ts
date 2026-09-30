import { AsyncLocalStorage } from "node:async_hooks";

// One native media operation at a time in this process, including generation
// validation. The asset queue also has a Redis global concurrency limit.
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
    return await ownership.run(true, operation);
  } finally {
    release();
  }
}
