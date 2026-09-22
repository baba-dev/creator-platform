import { ProviderRequestError } from "./index";

export interface StreamContext {
  readonly controller: AbortController;
  readonly timeoutMs: number;
  readonly idleTimeoutMs: number;
  readonly startTime: number;
  totalTimer: ReturnType<typeof setTimeout>;
  bodyConsumed: boolean;
  cleanedUp: boolean;
  cleanup: () => void;
}

export const responseContexts = new WeakMap<Response, StreamContext>();

export async function cancelAbandonedBody(response: Response): Promise<void> {
  const context = responseContexts.get(response);
  if (context) {
    responseContexts.delete(response);
    context.cleanup();
  }
  if (!context?.bodyConsumed && response.body && !response.bodyUsed) {
    try {
      await response.body.cancel?.();
    } catch {
      // Ignore cancellation failures on abandoned streams.
    }
  }
}

export async function readChunkWithDeadline<T>(
  reader: ReadableStreamDefaultReader<T>,
  context?: StreamContext,
): Promise<ReadableStreamReadResult<T>> {
  if (!context) {
    return await reader.read();
  }

  if (context.controller.signal.aborted) {
    throw new Error("Request aborted");
  }

  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;

  try {
    const readPromise = reader.read();
    readPromise.catch(() => {});

    const deadlinePromise = new Promise<never>((_, reject) => {
      abortHandler = () => {
        reject(new Error("Request aborted"));
      };
      context.controller.signal.addEventListener("abort", abortHandler, {
        once: true,
      });

      if (context.idleTimeoutMs > 0 && Number.isFinite(context.idleTimeoutMs)) {
        idleTimer = setTimeout(() => {
          context.controller.abort(new Error("Stream idle timeout"));
          reject(new Error("Stream idle timeout"));
        }, context.idleTimeoutMs);
        idleTimer.unref?.();
      }
    });

    return await Promise.race([readPromise, deadlinePromise]);
  } finally {
    if (idleTimer !== undefined) {
      clearTimeout(idleTimer);
    }
    if (abortHandler !== undefined) {
      context.controller.signal.removeEventListener("abort", abortHandler);
    }
  }
}

export interface SharedReadResponseOptions {
  providerName: "BytePlus" | "NVIDIA";
  onAbortCode?: string;
  onAbortRetryable?: boolean;
  onNetworkErrorCode?: string;
}

export async function sharedReadResponseText(
  response: Response,
  maximumBytes: number,
  options: SharedReadResponseOptions,
): Promise<string> {
  const context = responseContexts.get(response);

  if (!response.body?.getReader) {
    try {
      const value = await response.text();
      if (new TextEncoder().encode(value).byteLength > maximumBytes) {
        throw new ProviderRequestError(
          `${options.providerName} response exceeded size limit`,
          true,
          { code: "RESPONSE_TOO_LARGE" },
        );
      }
      if (context) {
        context.bodyConsumed = true;
      }
      return value;
    } catch (error) {
      if (error instanceof ProviderRequestError) throw error;
      if (context?.controller.signal.aborted) {
        throw new ProviderRequestError(
          `${options.providerName} network request failed`,
          options.onAbortRetryable ?? true,
          { cause: error, code: options.onAbortCode ?? "REQUEST_TIMEOUT" },
        );
      }
      throw new ProviderRequestError(
        `${options.providerName} response read failed`,
        true,
        { cause: error, code: options.onNetworkErrorCode ?? "NETWORK_ERROR" },
      );
    } finally {
      context?.cleanup();
    }
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteCount = 0;
  let value = "";
  let streamFinished = false;

  try {
    while (true) {
      const next = await readChunkWithDeadline(reader, context);
      if (next.done) {
        streamFinished = true;
        break;
      }
      byteCount += next.value.byteLength;
      if (byteCount > maximumBytes) {
        await reader.cancel().catch(() => {});
        throw new ProviderRequestError(
          `${options.providerName} response exceeded size limit`,
          true,
          { code: "RESPONSE_TOO_LARGE" },
        );
      }
      value += decoder.decode(next.value, { stream: true });
    }
    value += decoder.decode();
    if (context) {
      context.bodyConsumed = true;
    }
    return value;
  } catch (error) {
    if (!streamFinished) {
      await reader.cancel().catch(() => {});
    }
    if (error instanceof ProviderRequestError) throw error;
    if (context?.controller.signal.aborted) {
      throw new ProviderRequestError(
        `${options.providerName} network request failed`,
        options.onAbortRetryable ?? true,
        { cause: error, code: options.onAbortCode ?? "REQUEST_TIMEOUT" },
      );
    }
    throw new ProviderRequestError(
      `${options.providerName} response read failed`,
      true,
      { cause: error, code: options.onNetworkErrorCode ?? "NETWORK_ERROR" },
    );
  } finally {
    context?.cleanup();
    try {
      reader.releaseLock();
    } catch {
      // Ignore releaseLock errors.
    }
  }
}

export interface ExecuteSafeFetchConfig {
  timeoutMs: number;
  idleTimeoutMs?: number;
  defaultIdleTimeoutMs?: number;
  providerName: "BytePlus" | "NVIDIA";
  onAbortCode?: string;
  onAbortRetryable?: boolean;
  onNetworkErrorCode?: string;
}

export async function executeSafeFetch(
  fetchFn: typeof globalThis.fetch,
  url: string,
  options: RequestInit,
  config: ExecuteSafeFetchConfig,
): Promise<Response> {
  const controller = new AbortController();

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason);
    } else {
      options.signal.addEventListener(
        "abort",
        () => controller.abort(options.signal?.reason),
        { once: true },
      );
    }
  }

  const effectiveIdleTimeoutMs =
    config.idleTimeoutMs ??
    Math.min(config.timeoutMs, config.defaultIdleTimeoutMs ?? 30_000);

  const context: StreamContext = {
    controller,
    timeoutMs: config.timeoutMs,
    idleTimeoutMs: effectiveIdleTimeoutMs,
    startTime: Date.now(),
    bodyConsumed: false,
    cleanedUp: false,
    cleanup() {
      if (this.cleanedUp) return;
      this.cleanedUp = true;
      clearTimeout(this.totalTimer);
    },
    totalTimer: undefined as unknown as ReturnType<typeof setTimeout>,
  };

  context.totalTimer = setTimeout(() => {
    controller.abort(new Error("Request timeout"));
  }, config.timeoutMs);
  context.totalTimer.unref?.();

  try {
    const response = await fetchFn(url, {
      ...options,
      signal: controller.signal,
    });
    responseContexts.set(response, context);
    return response;
  } catch (error) {
    context.cleanup();
    throw new ProviderRequestError(
      `${config.providerName} network request failed`,
      options.signal?.aborted ? false : (config.onAbortRetryable ?? true),
      {
        cause: error,
        code: controller.signal.aborted
          ? (config.onAbortCode ?? "REQUEST_TIMEOUT")
          : (config.onNetworkErrorCode ?? "NETWORK_ERROR"),
      },
    );
  }
}
