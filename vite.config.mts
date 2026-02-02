import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let commitHash = "Dev";
try {
  const hash = execSync("git rev-parse --short HEAD").toString().trim();
  const isDirty =
    execSync("git status --porcelain").toString().trim().length > 0;
  commitHash = isDirty ? `${hash}-dirty` : hash;
} catch {
  // Fallback to Dev if git is not available or fails
}

const appVersion = JSON.stringify(
  JSON.parse(readFileSync("package.json", "utf-8")).version,
);

const defines = {
  __APP_VERSION__: appVersion,
  __APP_HASH__: JSON.stringify(commitHash),
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main-Process entry file of the Electron App.
        entry: "src/main/main.ts",
        vite: {
          define: defines,
        },
      },
      {
        entry: "src/main/preload.ts",
        onstart(options) {
          options.reload();
        },
        vite: {
          define: defines,
        },
      },
      {
        entry: "src/main/kakao/preload.ts",
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: "dist-electron/kakao",
            minify: process.env.NODE_ENV === "production",
            lib: {
              entry: "src/main/kakao/preload.ts",
              formats: ["cjs"],
              fileName: () => "[name].js",
            },
            rollupOptions: {
              external: ["electron"],
              output: {
                // Force name to be simple
                entryFileNames: "[name].js",
              },
            },
          },
          define: defines,
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 54321,
    strictPort: true,
  },
  define: defines,
});
