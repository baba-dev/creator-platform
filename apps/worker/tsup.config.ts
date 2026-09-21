import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "byteplus-smoke": "scripts/byteplus-smoke.ts",
  },
  bundle: true,
  clean: true,
  format: ["esm"],
  noExternal: [/^(?!@prisma\/|\.prisma\/).*/],
  external: ["@prisma/client"],
  platform: "node",
  sourcemap: true,
  target: "node24",
});
