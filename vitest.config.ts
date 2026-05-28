import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@poe2-launcher/launcher": path.resolve(
        __dirname,
        "packages/launcher/src",
      ),
      "@poe2-launcher/pob-bridge": path.resolve(
        __dirname,
        "packages/pob-bridge/src",
      ),
      "@poe2-launcher/pob-ui": path.resolve(__dirname, "packages/pob-ui/src"),
      "@poe2-launcher/pob-repoe": path.resolve(
        __dirname,
        "packages/pob-repoe/src",
      ),
      "@poe2-launcher/pob-vault": path.resolve(
        __dirname,
        "packages/pob-vault/src",
      ),
      "@poe2-launcher/shared": path.resolve(__dirname, "packages/shared/src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify("0.0.0-test"),
    __APP_AUTHOR_EMAIL__: JSON.stringify("test@example.com"),
    __APP_HASH__: JSON.stringify("test-hash"),
    __APP_GUID__: JSON.stringify("test-guid"),
    __PRODUCT_NAME__: JSON.stringify("Test Product"),
  },
});
