import { describe, it, expect, vi } from "vitest";

import { SettingItem } from "./types";

// Mocking BEFORE imports
vi.stubGlobal("import", { meta: { env: { VITE_SHOW_GAME_WINDOW: "false" } } });
vi.stubGlobal("window", { electronAPI: {} });
vi.stubGlobal("__APP_VERSION__", "0.0.0-test");
vi.stubGlobal("__APP_HASH__", "test-hash");

// Dynamic imports are needed because the mocked globals must exist
// BEFORE the module is evaluated.
const { SETTINGS_CONFIG } = await import("./settings-config");
const { DEFAULT_CONFIG } = await import("@poe2-launcher/shared/config");

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

    // 진단 정보를 assertion message에 직접 담는다. console.warn 은
    // stdout 을 가리는 환경(프록시/리포터)에서 유실되지만, 실패 메시지는
    // 항상 노출되므로 무엇이/왜 빠졌고 어떻게 고치는지 즉시 보인다.
    const failureHint =
      missingKeys.length > 0
        ? [
            `${missingKeys.length}개 설정이 settings-config.ts 의 store-backed UI 아이템`,
            `(defaultValue 없음)이지만 packages/shared/src/config.ts DEFAULT_CONFIG 에 없습니다:`,
            ...missingKeys.map((k) => `  - ${k}`),
            `→ 해결: 해당 키를 DEFAULT_CONFIG 와 CONFIG_METADATA 양쪽에 등록.`,
            `   (참고: 이 테스트는 settings-config.ts UI 아이템만 검사함.`,
            `    UI 없는 자동관리 config 누락은 여기서 잡히지 않음.)`,
          ].join("\n")
        : "";

    expect(missingKeys, failureHint).toEqual([]);
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
