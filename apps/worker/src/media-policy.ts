/** Input decoder options must precede each -i; encoder options precede output. */
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
