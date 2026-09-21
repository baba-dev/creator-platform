import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "byteplus-smoke": "scripts/byteplus-smoke.ts",
  },
  bundle: true,
  clean: true,
  format: ["esm"],
  noExternal: [/.*/],
  platform: "node",
  sourcemap: true,
  target: "node24",
});
