import { readFile } from "node:fs/promises";
export function parsePressure(text: string): number | null {
  const value = Number(/^some\s+avg10=([\d.]+)/m.exec(text)?.[1]);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}
export function parseCpuTicks(
  text: string,
): { total: number; steal: number } | null {
  const line = /^cpu\s+(.+)$/m.exec(text)?.[1];
  if (!line) return null;
  const values = line.trim().split(/\s+/).slice(0, 8).map(Number);
  if (
    values.length < 8 ||
    values.some((value) => !Number.isFinite(value) || value < 0)
  )
    return null;
  return { total: values.reduce((a, b) => a + b, 0), steal: values[7]! };
}
let previous: ReturnType<typeof parseCpuTicks> = null;
export async function hostPressure() {
  const read = (path: string) => readFile(path, "utf8").catch(() => "");
  const [memory, cpu, cpuPressure, memoryPressure, ioPressure] =
    await Promise.all([
      read("/proc/meminfo"),
      read("/proc/stat"),
      read("/proc/pressure/cpu"),
      read("/proc/pressure/memory"),
      read("/proc/pressure/io"),
    ]);
  const total = Number(/^MemTotal:\s+(\d+)/m.exec(memory)?.[1]);
  const available = Number(/^MemAvailable:\s+(\d+)/m.exec(memory)?.[1]);
  const current = parseCpuTicks(cpu);
  const cpuStealPercent =
    current &&
    previous &&
    current.total > previous.total &&
    current.steal >= previous.steal
      ? Math.min(
          100,
          (100 * (current.steal - previous.steal)) /
            (current.total - previous.total),
        )
      : null;
  previous = current;
  return {
    availableMemoryPercent:
      Number.isFinite(total) && Number.isFinite(available) && total > 0
        ? Math.min(100, (100 * available) / total)
        : null,
    cpuStealPercent,
    cpuPressureAvg10: parsePressure(cpuPressure),
    memoryPressureAvg10: parsePressure(memoryPressure),
    ioPressureAvg10: parsePressure(ioPressure),
  };
}
