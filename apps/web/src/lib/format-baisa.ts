export const MUSCAT_TIME_ZONE = "Asia/Muscat";
const MUSCAT_UTC_OFFSET = "+04:00";

/**
 * Format integer baisa to standard OMR decimal string.
 * 1 OMR = 1,000 baisa.
 */
export function formatBaisa(baisa: bigint): string {
  const isNegative = baisa < 0n;
  const absBaisa = isNegative ? -baisa : baisa;
  const omr = absBaisa / 1000n;
  const rem = absBaisa % 1000n;
  const formattedRem = rem.toString().padStart(3, "0");
  const sign = isNegative ? "-" : "";
  return `${sign}${omr.toLocaleString("en-US")}.${formattedRem} OMR`;
}

export function formatCredits(credits: bigint): string {
  return credits.toLocaleString("en-US");
}

function muscatParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MUSCAT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  ) as Record<string, string>;
}

export function formatMuscatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-OM", {
    timeZone: MUSCAT_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatMuscatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-OM", {
    timeZone: MUSCAT_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(date);
}

export function formatMuscatCsvTimestamp(date: Date): string {
  const parts = muscatParts(date);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${MUSCAT_UTC_OFFSET}`;
}

export function toMuscatDateTimeLocalValue(date: Date): string {
  const parts = muscatParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function muscatLocalDateTimeToIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new RangeError("Invalid Muscat date and time.");
  }

  const parsed = new Date(`${value}:00${MUSCAT_UTC_OFFSET}`);
  if (Number.isNaN(parsed.getTime())) {
    throw new RangeError("Invalid Muscat date and time.");
  }

  return parsed.toISOString();
}
