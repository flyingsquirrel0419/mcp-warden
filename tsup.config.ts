import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  external: ["better-sqlite3"],
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: { resolve: ["@modelcontextprotocol/sdk"] },
  outDir: "dist",
  onSuccess: "cp -r src/dashboard/public dist/public",
});
