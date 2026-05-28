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

const packageJson = JSON.parse(readFileSync("package.json", "utf-8"));
const appVersion = JSON.stringify(packageJson.version);
const appAuthorEmail = JSON.stringify(packageJson.author.email);

const builderConfig = readFileSync("electron-builder.json5", "utf-8");
const guidMatch = builderConfig.match(/guid:\s*["'](.*?)["']/);
const appGuid = guidMatch
  ? guidMatch[1]
  : "612ccee6-aa48-58b5-9d2e-fdd023b16218";

const productNameMatch = builderConfig.match(/productName:\s*["'](.*?)["']/);
const productName = productNameMatch
  ? productNameMatch[1]
  : "POE2 Unofficial Launcher";

const defines = {
  __APP_VERSION__: appVersion,
  __APP_AUTHOR_EMAIL__: appAuthorEmail,
  __APP_HASH__: JSON.stringify(commitHash),
  __APP_GUID__: JSON.stringify(appGuid),
  __PRODUCT_NAME__: JSON.stringify(productName),
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main-Process entry file of the Electron App.
        entry: "packages/launcher/src/main/main.ts",
        vite: {
          define: defines,
          build: {
            rollupOptions: {
              external: ["canvas"],
            },
          },
        },
      },
      {
        entry: "packages/launcher/src/main/workers/FontMutatorWorker.ts",
        onstart(options) {
          options.reload();
        },
        vite: {
          define: defines,
          build: {
            outDir: "dist-electron/workers",
            lib: {
              entry: "packages/launcher/src/main/workers/FontMutatorWorker.ts",
              formats: ["cjs"],
              fileName: () => "[name].js",
            },
          },
        },
      },
      {
        entry: "packages/launcher/src/main/workers/OtfMutatorWorker.ts",
        onstart(options) {
          options.reload();
        },
        vite: {
          define: defines,
          build: {
            outDir: "dist-electron/workers",
            emptyOutDir: false,
            lib: {
              entry: "packages/launcher/src/main/workers/OtfMutatorWorker.ts",
              formats: ["cjs"],
              fileName: () => "[name].js",
            },
          },
        },
      },
      {
        entry: "packages/launcher/src/main/preload.ts",
        onstart(options) {
          options.reload();
        },
        vite: {
          define: defines,
        },
      },
      {
        entry: "packages/launcher/src/main/pob-preload.ts",
        onstart(options) {
          options.reload();
        },
        vite: {
          define: defines,
          build: {
            rollupOptions: {
              output: {
                entryFileNames: "[name].js",
              },
            },
          },
        },
      },
      {
        entry: "packages/launcher/src/main/kakao/preload.ts",
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: "dist-electron/kakao",
            minify: process.env.NODE_ENV === "production",
            lib: {
              entry: "packages/launcher/src/main/kakao/preload.ts",
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
      "@poe2-launcher/pob-bridge": path.resolve(
        __dirname,
        "packages/pob-bridge/src",
      ),
      "@poe2-launcher/launcher": path.resolve(
        __dirname,
        "packages/launcher/src",
      ),
      "@poe2-launcher/pob-ui": path.resolve(
        __dirname,
        "packages/pob-ui/src",
      ),
      "@poe2-launcher/pob-repoe": path.resolve(
        __dirname,
        "packages/pob-repoe/src",
      ),
      "@poe2-launcher/pob-vault": path.resolve(
        __dirname,
        "packages/pob-vault/src",
      ),
      "@poe2-launcher/shared": path.resolve(
        __dirname,
        "packages/shared/src",
      ),
      "@": path.resolve(__dirname, "packages/launcher/src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        pob: path.resolve(__dirname, "pob.html"),
      },
    },
  },
  server: {
    port: 54321,
    strictPort: true,
  },
  define: defines,
});
