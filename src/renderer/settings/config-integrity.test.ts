import { describe, it, expect, vi } from "vitest";

// Mocking BEFORE imports
vi.stubGlobal("import", { meta: { env: { VITE_SHOW_GAME_WINDOW: "false" } } });
vi.stubGlobal("window", { electronAPI: {} });
vi.stubGlobal("__APP_VERSION__", "0.0.0-test");
vi.stubGlobal("__APP_HASH__", "test-hash");

// Dynamic imports are needed because the mocked globals must exist
// BEFORE the module is evaluated.
const { SETTINGS_CONFIG } = await import("./settings-config");
const { DEFAULT_CONFIG } = await import("../../shared/config");
import { SettingItem } from "./types";

describe("Settings Configuration Integrity", () => {
  // Flatten all items from categories -> sections -> items
  const allItems: SettingItem[] = SETTINGS_CONFIG.flatMap((cat) =>
    cat.sections.flatMap((sec) => sec.items),
  );

  it("should have all 'store-backed' settings defined in shared/config.ts", () => {
    const missingKeys: string[] = [];

    allItems.forEach((item) => {
      // 1. Skip items that are purely UI-based (Button, Text)
      if (item.type === "button" || item.type === "text") return;

      // 2. Determine if the item relies on the persistent store
      // Logic: If defaultValue is missing (undefined), it implies reliance on the Store (DEFAULT_CONFIG).
      //        If defaultValue exists, it's considered self-managed or UI-only state.
      const isStoreBacked = item.defaultValue === undefined;

      if (isStoreBacked) {
        // 3. Verify existence in DEFAULT_CONFIG
        if (!(item.id in DEFAULT_CONFIG)) {
          missingKeys.push(item.id);
        }
      }
    });

    if (missingKeys.length > 0) {
      console.warn(
        `\n[Config Integrity Warning] The following settings rely on the Store (no defaultValue) but are MISSING in shared/config.ts:\n ${missingKeys.map((k) => `- ${k}`).join("\n")}\n`,
      );
    }

    // Fail the test if strict mode is desired, or just warn.
    // User requested: "warn if not defined", but in test environment, failure is the standard way to "warn".
    expect(missingKeys).toEqual([]);
  });

  it("should check for potential ambiguity (Info only)", () => {
    // This test is just for informational purposes about items that have BOTH defaultValue and Store entry.
    allItems.forEach((item) => {
      if (item.type === "button" || item.type === "text") return;

      if (item.defaultValue !== undefined && item.id in DEFAULT_CONFIG) {
        // Log or track if needed
      }
    });
  });
});
