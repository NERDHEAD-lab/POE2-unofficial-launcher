import { describe, expect, it } from "vitest";

import { formatVaultSize, formatVaultTimestamp } from "./vaultSettingsFormat";

describe("vault settings formatters", () => {
  it("formats generation sizes with stable units", () => {
    expect(formatVaultSize(0)).toBe("0 B");
    expect(formatVaultSize(512)).toBe("512 B");
    expect(formatVaultSize(1536)).toBe("1.5 KB");
    expect(formatVaultSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("keeps missing and invalid timestamps explicit", () => {
    expect(formatVaultTimestamp(null, "-")).toBe("-");
    expect(formatVaultTimestamp("not-a-date", "-")).toBe("not-a-date");
  });
});
