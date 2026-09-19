export const MAX_EXPORT_ROWS = 50_000;

export function escapeCsvCell(
  value: string | number | bigint | null | undefined,
): string {
  if (value === null || value === undefined) return "";

  let text = String(value);
  if (/^[\t\r ]*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}
