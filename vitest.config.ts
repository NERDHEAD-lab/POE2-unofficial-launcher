import { defineConfig } from "vitest/config";

export default defineConfig({
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
