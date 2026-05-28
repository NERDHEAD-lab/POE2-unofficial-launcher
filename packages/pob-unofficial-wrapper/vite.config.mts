import path from "node:path";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((mod) => `node:${mod}`),
]);

export default defineConfig({
  resolve: {
    alias: {
      "@poe2-launcher/pob-bridge": path.resolve(
        repoRoot,
        "packages/pob-bridge/src",
      ),
      "@poe2-launcher/pob-repoe": path.resolve(
        repoRoot,
        "packages/pob-repoe/src",
      ),
      "@poe2-launcher/pob-vault": path.resolve(
        repoRoot,
        "packages/pob-vault/src",
      ),
      "@poe2-launcher/shared": path.resolve(repoRoot, "packages/shared/src"),
    },
  },
  build: {
    emptyOutDir: true,
    lib: {
      entry: {
        main: path.resolve(__dirname, "src/main.ts"),
        preload: path.resolve(__dirname, "src/preload.ts"),
      },
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ["cjs"],
    },
    minify: false,
    outDir: "dist",
    rollupOptions: {
      external: (id) => id === "electron" || nodeBuiltins.has(id),
    },
    target: "node24",
  },
});
