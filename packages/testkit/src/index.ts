let sequence = 0;

export function deterministicId(prefix = "test"): string {
  sequence += 1;
  return `${prefix}_${sequence.toString().padStart(6, "0")}`;
}

export function resetTestSequence(): void {
  sequence = 0;
}

export function fixedDate(): Date {
  return new Date("2026-01-01T00:00:00.000Z");
}
