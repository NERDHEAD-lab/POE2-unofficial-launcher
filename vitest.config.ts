import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify("0.0.0-test"),
  },
});
