import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  bundle: true,
  clean: true,
  format: ["esm"],
  noExternal: [/.*/],
  platform: "node",
  sourcemap: true,
  target: "node24",
});
