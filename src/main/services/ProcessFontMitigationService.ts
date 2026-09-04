import {
  FONT_FORCE_APPLY_TARGETS,
  normalizeFontForceApplyState,
} from "../../shared/font-force-apply";
import {
  getAllGameStatuses,
  isLaunchBlockingStatus,
} from "../state/GameStatusStore";
import { getConfig } from "../store";
import { setConfigWithEvent } from "../utils/config-utils";
import { PowerShellManager, UACDeniedException } from "../utils/powershell";

import type {
  FontForceApplyPolicy,
  FontForceApplyUpdateResult,
} from "../../shared/types";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const isGameBusy = () =>
  getAllGameStatuses().some(({ status }) => isLaunchBlockingStatus(status));

export class ProcessFontMitigationService {
  private static instance: ProcessFontMitigationService;
  private queue: Promise<unknown> = Promise.resolve();

  public static getInstance(): ProcessFontMitigationService {
    return (this.instance ??= new ProcessFontMitigationService());
  }

  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.then(action);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private cachedState() {
    return normalizeFontForceApplyState(getConfig("fontForceApplyState"));
  }

  private failure(error: unknown): FontForceApplyPolicy {
    const message = errorMessage(error);
    return {
      state: this.cachedState(),
      errors: { "PathOfExile_KG.exe": message, "PathOfExile.exe": message },
    };
  }

  /** Only called inside the queue. Failed reads never downgrade the last-known cache. */
  private async refresh(): Promise<FontForceApplyPolicy> {
    try {
      const pm = PowerShellManager.getInstance();
      await pm.confirmFontForceApplyIdle();
      const observed = await pm.getFontForceApplyPolicy();
      const previous = this.cachedState();
      const state = { ...previous };
      for (const target of FONT_FORCE_APPLY_TARGETS) {
        if (!observed.errors[target] && observed.state[target] !== null)
          state[target] = observed.state[target];
      }
      if (
        FONT_FORCE_APPLY_TARGETS.some(
          (target) => state[target] !== previous[target],
        )
      ) {
        setConfigWithEvent("fontForceApplyState", state);
      }
      return { state, errors: observed.errors };
    } catch (error) {
      return this.failure(error);
    }
  }

  public getPolicy(): Promise<FontForceApplyPolicy> {
    return this.serialize(() => this.refresh());
  }

  public async setPolicy(
    enabled: boolean,
  ): Promise<FontForceApplyUpdateResult> {
    if (typeof enabled !== "boolean")
      throw new Error("폰트 정책 값은 boolean이어야 합니다.");
    return this.serialize(async () => {
      if (isGameBusy())
        return {
          ...this.failure(
            "게임 실행 준비 또는 실행 중에는 변경할 수 없습니다.",
          ),
          error: "게임을 먼저 종료해 주세요.",
        };
      const before = await this.refresh();
      if (Object.keys(before.errors).length)
        return {
          ...before,
          error: "현재 정책을 확인하지 못해 변경하지 않았습니다.",
        };
      if (isGameBusy())
        return { ...before, error: "게임을 먼저 종료해 주세요." };

      let error: string | undefined;
      let cancelled = false;
      try {
        const failures =
          await PowerShellManager.getInstance().setFontForceApplyPolicy(
            enabled,
          );
        if (Object.keys(failures).length)
          error = Object.entries(failures)
            .map(([target, reason]) => `${target}: ${reason}`)
            .join(" / ");
      } catch (cause) {
        cancelled = cause instanceof UACDeniedException;
        error = errorMessage(cause);
      }
      // refresh first fences uncertain admin writes; a normal-session query alone is not sufficient.
      const after = await this.refresh();
      if (
        !error &&
        (Object.keys(after.errors).length ||
          FONT_FORCE_APPLY_TARGETS.some(
            (target) => after.state[target] !== enabled,
          ))
      ) {
        error =
          "요청한 정책이 모두 확인되지 않았습니다. Windows 보안 정책과 대상별 상태를 확인해 주세요.";
      }
      return {
        ...after,
        ...(error ? { error } : {}),
        ...(cancelled ? { cancelled: true } : {}),
      };
    });
  }
}
