import { beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeFontForceApplyState } from "../../shared/font-force-apply";
import { ProcessFontMitigationService } from "../services/ProcessFontMitigationService";
import {
  resetGameStatusCacheForTests,
  updateGameStatusCache,
} from "../state/GameStatusStore";
import { PowerShellManager, UACDeniedException } from "../utils/powershell";

import type { FontForceApplyPolicy } from "../../shared/types";

const store = vi.hoisted(() => ({ value: {} as unknown, save: vi.fn() }));
vi.mock("../store", () => ({ getConfig: () => store.value }));
vi.mock("../utils/config-utils", () => ({
  setConfigWithEvent: (key: string, value: unknown) => {
    store.save(key, value);
    store.value = value;
  },
}));

const policy = (
  kg: boolean | null,
  ggg: boolean | null,
): FontForceApplyPolicy => ({
  state: { "PathOfExile_KG.exe": kg, "PathOfExile.exe": ggg },
  errors: {},
});
const pm = PowerShellManager.getInstance();
let service: ProcessFontMitigationService;

beforeEach(() => {
  vi.restoreAllMocks();
  store.value = policy(null, null).state;
  store.save.mockClear();
  resetGameStatusCacheForTests();
  vi.spyOn(pm, "confirmFontForceApplyIdle").mockResolvedValue();
  vi.spyOn(pm, "getFontForceApplyPolicy").mockResolvedValue(
    policy(false, false),
  );
  vi.spyOn(pm, "setFontForceApplyPolicy").mockResolvedValue({});
  service = new ProcessFontMitigationService();
});

describe("ProcessFontMitigationService", () => {
  it("normalizes legacy, damaged and incomplete cached maps without treating unknown as OFF", () => {
    expect(normalizeFontForceApplyState(undefined)).toEqual(
      policy(null, null).state,
    );
    expect(normalizeFontForceApplyState("mixed")).toEqual(
      policy(null, null).state,
    );
    expect(
      normalizeFontForceApplyState({
        "PathOfExile_KG.exe": true,
        "PathOfExile.exe": "ON",
        extra: true,
      }),
    ).toEqual(policy(true, null).state);
  });

  it("persists only verified reads as a new map and broadcasts through the existing config path", async () => {
    const before = policy(null, null).state;
    store.value = before;
    await expect(service.getPolicy()).resolves.toEqual(policy(false, false));
    expect(before).toEqual(policy(null, null).state);
    expect(store.save).toHaveBeenCalledWith(
      "fontForceApplyState",
      policy(false, false).state,
    );
    await service.getPolicy();
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("updates the successful target and retains the failed target's last-known value", async () => {
    store.value = policy(false, true).state;
    vi.mocked(pm.getFontForceApplyPolicy).mockResolvedValue({
      ...policy(true, null),
      errors: { "PathOfExile.exe": "denied" },
    });
    const result = await service.getPolicy();
    expect(result.state).toEqual(policy(true, true).state);
    expect(result.errors).toEqual({ "PathOfExile.exe": "denied" });
  });

  it("retains both cached values after a total read failure", async () => {
    store.value = policy(true, false).state;
    vi.mocked(pm.getFontForceApplyPolicy).mockRejectedValue(
      new Error("blocked"),
    );
    const result = await service.getPolicy();
    expect(result.state).toEqual(store.value);
    expect(Object.keys(result.errors)).toHaveLength(2);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("refuses mutation if either current policy cannot be read", async () => {
    vi.mocked(pm.getFontForceApplyPolicy).mockResolvedValue({
      ...policy(null, false),
      errors: { "PathOfExile_KG.exe": "unsupported" },
    });
    expect((await service.setPolicy(true)).error).toBeTruthy();
    expect(pm.setFontForceApplyPolicy).not.toHaveBeenCalled();
  });

  it("re-reads after a write and persists the observed policy, not the requested boolean", async () => {
    vi.mocked(pm.getFontForceApplyPolicy)
      .mockResolvedValueOnce(policy(false, false))
      .mockResolvedValueOnce(policy(true, true));
    await expect(service.setPolicy(true)).resolves.toEqual(policy(true, true));
    expect(store.value).toEqual(policy(true, true).state);
    expect(pm.setFontForceApplyPolicy).toHaveBeenCalledWith(true);
  });

  it("reports partial writes and keeps the resulting mixed map", async () => {
    vi.mocked(pm.getFontForceApplyPolicy)
      .mockResolvedValueOnce(policy(false, false))
      .mockResolvedValueOnce(policy(true, false));
    vi.mocked(pm.setFontForceApplyPolicy).mockResolvedValue({
      "PathOfExile.exe": "denied",
    });
    const result = await service.setPolicy(true);
    expect(result.state).toEqual(policy(true, false).state);
    expect(result.error).toContain("denied");
  });

  it("does not report OFF success when inherited policy remains ON", async () => {
    vi.mocked(pm.getFontForceApplyPolicy).mockResolvedValue(policy(true, true));
    const result = await service.setPolicy(false);
    expect(result.state).toEqual(policy(true, true).state);
    expect(result.error).toBeTruthy();
  });

  it("handles UAC cancellation without optimistic cache changes", async () => {
    vi.mocked(pm.setFontForceApplyPolicy).mockRejectedValue(
      new UACDeniedException(),
    );
    const result = await service.setPolicy(true);
    expect(result.cancelled).toBe(true);
    expect(result.state).toEqual(policy(false, false).state);
  });

  it("does not read past an unfinished admin write or enable subsequent writes", async () => {
    vi.mocked(pm.setFontForceApplyPolicy).mockRejectedValue(
      new Error("timed out"),
    );
    vi.mocked(pm.confirmFontForceApplyIdle)
      .mockResolvedValueOnce()
      .mockRejectedValue(new Error("종료 미확인"));
    const result = await service.setPolicy(true);
    expect(Object.keys(result.errors)).toHaveLength(2);
    expect(pm.getFontForceApplyPolicy).toHaveBeenCalledTimes(1);
    await service.setPolicy(false);
    expect(pm.setFontForceApplyPolicy).toHaveBeenCalledTimes(1);
  });

  it.each(["preparing", "ready", "running"] as const)(
    "blocks any game's %s status before mutation",
    async (status) => {
      updateGameStatusCache({ gameId: "POE1", serviceId: "GGG", status });
      expect((await service.setPolicy(true)).error).toContain("게임");
      expect(pm.setFontForceApplyPolicy).not.toHaveBeenCalled();
    },
  );

  it("validates IPC values at the service boundary", async () => {
    await expect(
      service.setPolicy("yes" as unknown as boolean),
    ).rejects.toThrow("boolean");
    expect(pm.setFontForceApplyPolicy).not.toHaveBeenCalled();
  });

  it("serializes a slow refresh before a mutation so stale results cannot overwrite readback", async () => {
    let finish!: (value: FontForceApplyPolicy) => void;
    vi.mocked(pm.getFontForceApplyPolicy)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce(policy(false, false))
      .mockResolvedValueOnce(policy(true, true));
    const oldRead = service.getPolicy();
    const change = service.setPolicy(true);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(pm.setFontForceApplyPolicy).not.toHaveBeenCalled();
    finish(policy(false, false));
    await oldRead;
    await change;
    expect(store.value).toEqual(policy(true, true).state);
  });
});
