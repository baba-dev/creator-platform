import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "media-ops": "scripts/media-ops.ts",
    "byteplus-smoke": "scripts/byteplus-smoke.ts",
  },
  bundle: true,
  clean: true,
  format: ["esm"],
  noExternal: [/^(?!@prisma\/|\.prisma\/|sharp$).*/],
  external: ["@prisma/client", "sharp"],
  platform: "node",
  sourcemap: true,
  target: "node24",
});
