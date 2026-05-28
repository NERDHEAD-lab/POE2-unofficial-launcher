import { describe, expect, it } from "vitest";

import {
  POB_WRAPPER_PACKAGE_NAME,
  POB_WRAPPER_PRODUCT_NAME,
  POB_WRAPPER_USER_DATA_DIRS,
  resolvePobWrapperUserDataPath,
} from "./namespace";

describe("pob-unofficial-wrapper namespace", () => {
  it("uses the requested executable workspace package name", () => {
    expect(POB_WRAPPER_PACKAGE_NAME).toBe("pob-unofficial-wrapper");
    expect(POB_WRAPPER_PRODUCT_NAME).toBe("PoB 2 Unofficial Wrapper");
  });

  it("keeps standalone and launcher-embedded appdata namespaces separate", () => {
    expect(POB_WRAPPER_USER_DATA_DIRS.standalone).not.toBe(
      POB_WRAPPER_USER_DATA_DIRS.launcher,
    );

    const appData = "C:\\Users\\nerd\\AppData\\Roaming";
    expect(resolvePobWrapperUserDataPath(appData, "standalone")).toBe(
      "C:\\Users\\nerd\\AppData\\Roaming\\PoB 2 Unofficial Wrapper",
    );
    expect(resolvePobWrapperUserDataPath(appData, "launcher")).toBe(
      "C:\\Users\\nerd\\AppData\\Roaming\\POE2 Unofficial Launcher - PoB Wrapper",
    );
  });
});
