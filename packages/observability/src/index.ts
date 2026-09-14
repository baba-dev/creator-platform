export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, fields?: Readonly<Record<string, unknown>>): void;
  info(message: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(message: string, fields?: Readonly<Record<string, unknown>>): void;
  error(message: string, fields?: Readonly<Record<string, unknown>>): void;
}

const sensitiveFieldPattern =
  /authorization|cookie|password|prompt|secret|token|mediaUrl|paymentReference/i;

function sanitizeFields(
  fields: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      sensitiveFieldPattern.test(key)
        ? "[REDACTED]"
        : value instanceof Error
          ? { name: value.name }
          : value,
    ]),
  );
}

export function createLogger(context: {
  readonly service: string;
  readonly version: string;
  readonly minimumLevel?: LogLevel;
}): Logger {
  const ranks: Readonly<Record<LogLevel, number>> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
  };
  const minimumRank = ranks[context.minimumLevel ?? "info"];

  function write(
    level: LogLevel,
    message: string,
    fields: Readonly<Record<string, unknown>> = {},
  ): void {
    if (ranks[level] < minimumRank) return;

    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: context.service,
      version: context.version,
      message,
      ...sanitizeFields(fields),
    });

    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.info(line);
  }

  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
  };
}
