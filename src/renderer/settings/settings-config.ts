import { SettingsCategory, SettingValue, DescriptionVariant } from "./types";
import { BackupMetadata } from "../../shared/types";
import imgUacTooltip from "../assets/settings/uac-tooltip.png";
import { logger } from "../utils/logger";

// Helper for Process Watch Mode Description (Warnings Only)
const updateProcessWatchModeDescription = async (
  mode: string,
  addDescription: (text: string, variant?: DescriptionVariant) => void,
  resetDescription: () => void,
) => {
  resetDescription();

  const isAlwaysOn = mode === "always-on";

  if (isAlwaysOn) {
    // Check for warnings
    const autoLaunch = await window.electronAPI?.getConfig("autoLaunch");
    const closeAction = await window.electronAPI?.getConfig("closeAction");

    const warnings: string[] = [];
    if (!autoLaunch)
      warnings.push("- 컴퓨터 시작 시 자동 실행이 꺼져 있습니다.");
    if (closeAction === "close")
      warnings.push(
        "- 닫기 설정이 '종료'로 되어 있습니다. (트레이 최소화 권장)",
      );

    if (warnings.length > 0) {
      addDescription(
        "[주의]\n" +
          warnings.join("\n") +
          "\n\n런처가 실행 중이지 않으면 감지가 불가능할 수 있습니다.",
        "warning",
      );
    }
  }
};

// Helper for Aggressive Mode Description
const updateAggressiveModeDescription = (
  aggressiveModeEnabled: boolean,
  uacBypassEnabled: boolean,
  addDescription: (text: string, variant?: DescriptionVariant) => void,
  resetDescription: () => void,
) => {
  resetDescription();
  if (aggressiveModeEnabled && !uacBypassEnabled) {
    addDescription(
      "[주의] DaumGameStarter UAC 우회가 꺼져있을 경우, 강제 종료 시 관리자 권한 요청(UAC)이 발생할 수 있습니다.",
      "warning",
    );
  }
};

const initBackupButton = async (
  {
    setValue: _setValue,
    addDescription,
    resetDescription,
    setDisabled: _setDisabled,
    setVisible,
  }: {
    setValue: (v: SettingValue) => void;
    addDescription: (text: string, variant?: DescriptionVariant) => void;
    resetDescription: () => void;
    setDisabled: (v: boolean) => void;
    setVisible: (v: boolean) => void;
  },
  service: "Kakao Games" | "GGG",
  game: "POE1" | "POE2",
) => {
  if (!window.electronAPI?.checkBackupAvailability) {
    setVisible(false);
    return;
  }

  const result = await window.electronAPI.checkBackupAvailability(
    service,
    game,
  );

  if (!result) {
    setVisible(false);
    return;
  }

  setVisible(true);

  if (typeof result === "object" && "timestamp" in result) {
    const meta = result as BackupMetadata;
    const dateStr = new Date(meta.timestamp).toLocaleString();
    let desc = "기존에 백업된 데이터로 게임을 복구합니다.";
    if (meta.version) desc += `\n- 버전: ${meta.version}`;
    desc += `\n- 백업 일시: ${dateStr}`;
    if (Array.isArray(meta.files)) desc += `\n- 파일: ${meta.files.length}개`;

    resetDescription();
    addDescription(desc);
  }
};

const initDevOption =
  (key: string) =>
  async ({
    setValue,
    setDisabled,
    addDescription,
    resetDescription: _resetDescription,
    setVisible: _setVisible,
  }: {
    setValue: (v: SettingValue) => void;
    addDescription: (text: string, variant?: DescriptionVariant) => void;
    resetDescription: () => void;
    setDisabled: (v: boolean) => void;
    setVisible: (v: boolean) => void;
  }) => {
    // 1. Force retrieval of raw value (ignore dependencies like dev_mode)
    if (window.electronAPI?.getConfig) {
      const rawValue = await window.electronAPI.getConfig(key, true);
      if (typeof rawValue === "boolean") {
        setValue(rawValue);
      }
    }

    // 2. Forced Setting Check (dev:test mode)
    if (window.electronAPI?.isConfigForced) {
      const isForced = await window.electronAPI.isConfigForced(key);
      if (isForced) {
        setValue(true);
        setDisabled(true);
        if (key === "dev_mode") {
          addDescription(
            "개발자 테스트 모드로 인해 이 설정은 강제 활성화되었습니다.",
            "info",
          );
        }
      }
    }
  };

export const SETTINGS_CONFIG: SettingsCategory[] = [
  {
    id: "general",
    label: "일반",
    icon: "settings",
    sections: [
      {
        id: "gen_launcher",
        title: "런쳐 설정",
        items: [
          {
            id: "autoLaunch",
            type: "check",
            label: "컴퓨터 시작 시 자동 실행",
            description: "컴퓨터 시작 시 게임 런처를 자동으로 실행합니다.",
            icon: "power_settings_new",

            onChangeListener: (val, { showToast }) => {
              showToast(
                `[컴퓨터 시작 시 자동 실행] ${val ? "ON (켜짐)" : "OFF (꺼짐)"}`,
              );
            },
          },
          {
            id: "quitOnGameStart",
            type: "check",
            label: "게임 실행 시 런처 닫기",
            description:
              "게임 실행 시 런처를 자동으로 닫습니다. (닫기 설정을 따름)",
            icon: "exit_to_app",
          },
          {
            id: "startMinimized",
            type: "check",
            label: "트레이로 최소화하여 실행",
            description:
              "자동 실행 시 창을 띄우지 않고 트레이 아이콘으로 시작합니다.",
            dependsOn: "autoLaunch",
            icon: "visibility_off",
          },
          {
            id: "closeAction",
            type: "radio",
            label: "닫기 설정",
            options: [
              { label: "트레이로 최소화", value: "minimize" },
              { label: "게임 런처 닫기", value: "close" },
            ],
            icon: "close", // Will be hidden by CSS but good for metadata
            onChangeListener: (val, { showToast }) => {
              showToast(
                `[닫기 설정] ${
                  val === "minimize" ? "트레이로 최소화" : "게임 런처 닫기"
                }`,
              );
            },
          },
        ],
      },
      {
        id: "gen_locale",
        title: "언어 설정",
        items: [
          {
            id: "language",
            type: "select",
            label: "런처 언어",
            description: "런처 언어를 변경합니다. (추후 지원 예정)",
            defaultValue: "ko",
            options: [
              { label: "한국어 (Korean)", value: "ko" },
              // { label: "English", value: "en" },
            ],
            icon: "translate",
            onChangeListener: (val, { showToast }) => {
              showToast(
                `[런처 언어] ${val === "ko" ? "한국어 (Korean)" : "English"}`,
              );
            },
          },
        ],
      },
    ],
  },
  {
    id: "Display",
    label: "화면",
    icon: "monitor",
    sections: [
      {
        id: "resolution",
        title: "해상도 및 창 크기",
        items: [
          {
            id: "autoResolution",
            type: "switch",
            label: "해상도 자동 조정 (권장)",
            description:
              "모니터 크기에 맞춰 최적의 해상도(1440x960, 1080x720) 또는 전체 화면(저해상도)을 자동으로 적용합니다.",
            onChangeListener: (val, { showToast }) => {
              if (val === false) {
                // Auto -> Manual: Sync current state
                const width = window.outerWidth;
                const height = window.outerHeight;
                const isFullscreen =
                  window.matchMedia("(display-mode: fullscreen)").matches ||
                  (window.innerWidth === screen.width &&
                    window.innerHeight === screen.height); // Simplified check

                let matchedMode = "1440x960";
                if (isFullscreen) {
                  matchedMode = "fullscreen";
                } else if (
                  Math.abs(width - 1080) < 10 &&
                  Math.abs(height - 720) < 10
                ) {
                  matchedMode = "1080x720";
                } else if (
                  Math.abs(width - 1440) < 10 &&
                  Math.abs(height - 960) < 10
                ) {
                  matchedMode = "1440x960";
                }

                // Update resolutionMode without triggering window resize (passive sync)
                // We use electronAPI to update config silently if possible?
                // Or just setConfig. Main process handles config change.
                // If main process sees resolutionMode change, it might re-apply.
                // But since it matches current, re-apply is no-op.
                if (window.electronAPI) {
                  window.electronAPI.setConfig("resolutionMode", matchedMode);
                  showToast(
                    `현재 해상도(${matchedMode})가 수동 설정으로 유지됩니다.`,
                  );
                }
              }
            },
          },
          {
            id: "resolutionMode",
            type: "select",
            label: "수동 해상도 선택",
            description: "원하는 창 크기 또는 모드를 선택합니다.",
            dependsOn: { key: "autoResolution", value: false },
            options: [
              { label: "창모드 (1440x960) - 기본", value: "1440x960" },
              {
                label: "창모드 (1080x720) - 소형 (노트북 등)",
                value: "1080x720",
              },
              { label: "전체창 (3:2 비율 고정)", value: "fullscreen" },
            ],
            onChangeListener: async (val, { showToast, showConfirm }) => {
              const labelMap: Record<string, string> = {
                "1440x960": "창모드 (1440x960)",
                "1080x720": "창모드 (1080x720)",
                fullscreen: "전체창 (3:2 비율)",
              };

              // 1. Show Toast for immediate feedback
              showToast(`[해상도 변경] ${labelMap[val as string] || val}`);

              // 2. Safe Revert Logic (Timer)
              return new Promise<boolean>((resolve) => {
                showConfirm({
                  title: "해상도 변경 확인",
                  message:
                    "변경된 해상도를 유지하시겠습니까?\n(10초 내에 확인하지 않으면 이전 설정으로 복구됩니다.)",
                  confirmText: "유지",
                  cancelText: "복구",
                  variant: "primary",
                  timeoutSeconds: 10,
                  onConfirm: () => {
                    showToast("해상도 설정이 저장되었습니다.", "success");
                    resolve(true);
                  },
                  onCancel: () => {
                    showToast("이전 해상도로 복구되었습니다.", "warning");
                    resolve(false); // Triggers auto-revert in SettingsContent
                  },
                });
              });
            },
          },
        ],
      },
    ],
  },
  {
    id: "performance",
    label: "성능",
    icon: "speed",
    sections: [
      {
        id: "perf_process",
        title: "프로세스 관리",
        items: [
          {
            id: "processWatchMode", // Match config name (but manual sync via defaultValue)
            type: "radio",
            label: "패치 오류 감지 모드",
            description: "",
            defaultValue: "resource-saving", // Prevents auto-sync to store
            options: [
              {
                label: "런처를 통한 실행만 감지",
                value: "resource-saving",
                description:
                  "런처의 [게임 시작] 버튼으로 실행할 때만 패치 오류를 검사합니다.",
              },
              {
                label: "항상 감지 (모든 경로)",
                value: "always-on",
                description:
                  "런처가 켜져 있다면, 홈페이지(카카오게임즈) 혹은 바로가기 실행(GGG) 시에도 즉시 오류를 감지합니다.",
              },
            ],
            icon: "monitor_heart",
            onInit: async ({
              setValue,
              addDescription,
              setLabel,
              resetDescription,
            }) => {
              // Manual Sync: Read from actual config
              const mode = (await window.electronAPI?.getConfig(
                "processWatchMode",
              )) as string;

              // Default to resource-saving if undefined/null
              const currentMode =
                mode === "always-on" ? "always-on" : "resource-saving";
              setValue(currentMode);

              // Clear default static label - Radio has its own labels
              setLabel("패치 오류 감지 모드");

              // Update Description using Helper
              await updateProcessWatchModeDescription(
                currentMode,
                addDescription,
                resetDescription,
              );
            },
            onChangeListener: async (
              val,
              { addDescription, resetDescription, showToast },
            ) => {
              // Manual Sync: Write to actual config
              // val is already string "resource-saving" | "always-on" due to Radio type
              const newMode = val as string;
              await window.electronAPI?.setConfig("processWatchMode", newMode);

              const isAlwaysOn = newMode === "always-on";

              showToast(
                `[패치 오류 감지] ${isAlwaysOn ? "항상 감지 (모든 경로)" : "런처를 통한 실행만 감지"}`,
              );

              // Update Description using Helper
              await updateProcessWatchModeDescription(
                newMode,
                addDescription,
                resetDescription,
              );
            },
          },
        ],
      },
    ],
  },
  /* {
    id: "display",
    label: "화면",
    icon: "display_settings",
    sections: [
      {
        id: "disp_theme",
        title: "테마 및 모양",
        items: [],
      },
    ],
  }, */
  {
    id: "account",
    label: "계정",
    icon: "manage_accounts",
    sections: [
      {
        id: "acc_kakao",
        title: "Kakao 계정 연동",
        items: [
          {
            id: "kakaoAccountId",
            type: "button",
            label: "카카오 계정",
            buttonText: "확인 중...",
            variant: "default",
            description: "저장된 카카오 계정 정보를 확인합니다.",
            icon: "manage_accounts",
            onInit: async ({
              addDescription,
              resetDescription,
              setButtonText,
              setVariant,
              setDisabled,
            }) => {
              if (!window.electronAPI) return;

              // 1. Initial State from Cache (Immediate Display)
              const cachedId =
                await window.electronAPI.getConfig("kakaoAccountId");
              if (cachedId) {
                resetDescription();
                addDescription(`접속 계정: ${cachedId}`);
                setButtonText("연동 해제");
                setVariant("danger");
              }

              // 2. Register Callback for Real-time Updates
              const cleanup = window.electronAPI.onAccountUpdate((data) => {
                setDisabled(false);
                resetDescription();

                if (data.id) {
                  addDescription(`접속 계정: ${data.id}`);
                  setButtonText("연동 해제");
                  setVariant("danger");
                } else if (data.loginRequired) {
                  addDescription(
                    "계정 정보 확인을 위해 로그인이 필요합니다.",
                    "warning",
                  );
                  setButtonText("로그인");
                  setVariant("primary");
                }
              });

              // 3. Trigger Background Validation (Silent Sync)
              setDisabled(true);
              setButtonText("확인 중...");
              window.electronAPI.triggerAccountValidation("Kakao Games");

              return cleanup;
            },
            onClickListener: async ({
              showToast,
              showConfirm,
              getButtonText,
            }) => {
              if (!window.electronAPI) return;

              const mode = getButtonText();

              if (mode === "로그인") {
                showToast("로그인 화면을 불러옵니다...");
                window.electronAPI.showLoginWindow("Kakao Games");
              } else if (mode === "연동 해제") {
                return new Promise<void>((resolve) => {
                  showConfirm({
                    title: "로그아웃 확인",
                    message:
                      "카카오 계정 세션 정보를 삭제하고 로그아웃 하시겠습니까?",
                    confirmText: "로그아웃",
                    variant: "danger",
                    onConfirm: async () => {
                      try {
                        showToast("[로그아웃] 요청 중...");
                        const success =
                          await window.electronAPI!.logoutSession();
                        if (success) {
                          showToast("[로그아웃] 완료되었습니다.");
                          // Note: Main process will likely trigger a reload or UI update if needed,
                          // or we can manually reset state here if desired.
                          // But logoutSession usually closes the window which clears things.
                        } else {
                          showToast("[로그아웃] 실패했습니다.");
                        }
                      } catch (err) {
                        logger.error("[Settings] Logout error:", err);
                        showToast("[로그아웃] 오류가 발생했습니다.");
                      } finally {
                        resolve();
                      }
                    },
                    onCancel: () => {
                      resolve();
                    },
                  });
                });
              }
            },
          },
        ],
      },
      {
        id: "acc_ggg",
        title: "GGG 계정 연동",
        items: [
          {
            id: "gggAccountId",
            type: "button",
            label: "GGG 계정",
            buttonText: "준비 중",
            variant: "default",
            disabled: true,
            description: "GGG(Global) 계정 연동 기능은 추후 지원 예정입니다.",
            icon: "public",
          },
        ],
      },
    ],
  },
  /* {
    id: "notification",
    label: "알림",
    icon: "notifications_active",
    sections: [],
  }, */
  {
    id: "automation",
    label: "자동화",
    icon: "smart_toy",
    sections: [
      {
        id: "adv_process",
        title: "프로세스 관리",
        items: [
          {
            id: "skipDaumGameStarterUac",
            type: "check",
            label: "DaumGameStarter UAC 우회",
            description:
              "게임 실행 시 발생하는 '사용자 계정 컨트롤' 팝업을 제거합니다. (관리자 권한 불필요)",
            icon: "speed",
            infoImage: imgUacTooltip, // [Restore] UAC Explanation Tooltip Image
            // [Sync] Explicitly handle init/change as requested
            onInit: async ({ setValue }) => {
              if (window.electronAPI) {
                const result = await window.electronAPI.isUACBypassEnabled();
                setValue(result);
              } else {
                setValue(false);
              }
            },
            onChangeListener: async (val, { showToast }) => {
              if (window.electronAPI) {
                // Return Promise to trigger auto-disable in SettingsContent.tsx
                return (async () => {
                  try {
                    showToast(
                      `[UAC 우회] ${val ? "적용 중..." : "해제 중..."}`,
                    );
                    const result = val
                      ? await window.electronAPI!.enableUACBypass()
                      : await window.electronAPI!.disableUACBypass();

                    if (result) {
                      showToast(
                        `[UAC 우회] ${val ? "적용 완료" : "해제 완료"}`,
                        "success",
                      );
                      return true;
                    } else {
                      showToast(
                        `[UAC 우회] ${val ? "적용 실패" : "해제 실패"}`,
                        "error",
                      );
                      return false;
                    }
                  } catch (error) {
                    showToast(`[UAC 우회] 오류 발생: ${error}`, "error");
                    return false;
                  }
                })();
              }
            },
          },
        ],
      },
      {
        id: "adv_patch",
        title: "패치 복구 설정",
        items: [
          {
            id: "autoFixPatchError",
            type: "check",
            label: "패치 오류 자동 수정 (Auto Fix)",
            description:
              "게임 실행 로그에서 패치 오류가 감지되면, 확인 창 없이 즉시 복구를 진행합니다.",
            icon: "autorenew",
          },
          {
            id: "aggressivePatchMode",
            type: "check",
            label: "한국인 모드 (BETA)",
            description:
              "단 한번이라도 다운로드에 실패하면 지체없이 강제 종료 후 복구합니다.",
            icon: "offline_bolt",
            dependsOn: "autoFixPatchError",
            refreshOn: ["skipDaumGameStarterUac"],
            onInit: async ({ addDescription, resetDescription }) => {
              if (window.electronAPI) {
                const aggressiveMode = await window.electronAPI.getConfig(
                  "aggressivePatchMode",
                );
                const uacBypassEnabled = await window.electronAPI.getConfig(
                  "skipDaumGameStarterUac",
                );

                updateAggressiveModeDescription(
                  !!aggressiveMode,
                  !!uacBypassEnabled,
                  addDescription,
                  resetDescription,
                );
              } else {
                updateAggressiveModeDescription(
                  false,
                  false, // Both default to false
                  addDescription,
                  resetDescription,
                );
              }
            },
            onChangeListener: async (
              val,
              { addDescription, resetDescription },
            ) => {
              if (window.electronAPI) {
                const uacBypassEnabled = await window.electronAPI.getConfig(
                  "skipDaumGameStarterUac",
                );
                updateAggressiveModeDescription(
                  val === true, // Current checkbox state
                  !!uacBypassEnabled,
                  addDescription,
                  resetDescription,
                );
              }
            },
          },
          {
            id: "autoGameStartAfterFix",
            type: "check",
            label: "패치 복구 후 게임 자동 시작",
            description:
              "패치 오류 자동 수정이 완료되면, 해당 서비스를 통해 게임을 자동으로 실행합니다.",
            icon: "play_circle",
            dependsOn: "autoFixPatchError",
          },
          {
            id: "backupPatchFiles",
            type: "check",
            label: "패치 파일 백업 (Backup)",
            description:
              "패치 파일 교체 시 원본 파일을 안전한 곳(.patch_backups)에 보관합니다.",
            icon: "save",
          },
          {
            id: "restore_kakao_poe1",
            type: "button",
            label: "카카오 POE1 복구",
            buttonText: "복구 실행",
            actionId: "restore_backup_kakao_poe1",
            icon: "history",
            dependsOn: "backupPatchFiles",
            onInit: (context) =>
              initBackupButton(context, "Kakao Games", "POE1"),
            onClickListener: () => {
              window.electronAPI?.triggerRestoreBackup("Kakao Games", "POE1");
            },
          },
          {
            id: "restore_kakao_poe2",
            type: "button",
            label: "카카오 POE2 복구",
            buttonText: "복구 실행",
            actionId: "restore_backup_kakao_poe2",
            icon: "history",
            dependsOn: "backupPatchFiles",
            onInit: (context) =>
              initBackupButton(context, "Kakao Games", "POE2"),
            onClickListener: () => {
              window.electronAPI?.triggerRestoreBackup("Kakao Games", "POE2");
            },
          },
          {
            id: "restore_ggg_poe1",
            type: "button",
            label: "GGG POE1 복구",
            buttonText: "복구 실행",
            actionId: "restore_backup_ggg_poe1",
            icon: "history",
            dependsOn: "backupPatchFiles",
            onInit: (context) => initBackupButton(context, "GGG", "POE1"),
            onClickListener: () => {
              window.electronAPI?.triggerRestoreBackup("GGG", "POE1");
            },
          },
          {
            id: "restore_ggg_poe2",
            type: "button",
            label: "GGG POE2 복구",
            buttonText: "복구 실행",
            actionId: "restore_backup_ggg_poe2",
            icon: "history",
            dependsOn: "backupPatchFiles",
            onInit: (context) => initBackupButton(context, "GGG", "POE2"),
            onClickListener: () => {
              window.electronAPI?.triggerRestoreBackup("GGG", "POE2");
            },
          },
        ],
      },
    ],
  },
  {
    id: "advanced",
    label: "고급 기능",
    icon: "terminal",
    sections: [
      {
        id: "adv_debug",
        title: "디버깅",
        items: [
          {
            id: "dev_mode",
            type: "check",
            label: "개발자 모드 활성화",
            icon: "bug_report",
            onInit: initDevOption("dev_mode"),
          },
          {
            id: "debug_console",
            type: "check",
            label: "디버그 콘솔 표시",
            icon: "terminal",
            dependsOn: "dev_mode",
            onInit: initDevOption("debug_console"),
          },
          {
            id: "show_inactive_windows",
            type: "check",
            label: "비활성 윈도우 표시",
            icon: "visibility",
            dependsOn: "dev_mode",
            onInit: initDevOption("show_inactive_windows"),
          },
          {
            id: "show_inactive_window_console",
            type: "check",
            label: "DevTools 표시 (Show DevTools)",
            icon: "javascript",
            dependsOn: "dev_mode",
            onInit: initDevOption("show_inactive_window_console"),
          },
        ],
      },
    ],
  },
  {
    id: "about",
    label: "정보",
    icon: "info",
    sections: [
      {
        id: "abt_info",
        title: "일반 정보",
        items: [
          {
            id: "version_info",
            type: "text",
            label: "현재 버전",
            value: `v${__APP_VERSION__} (${__APP_HASH__})`,
            icon: "tag",
          },
          {
            id: "license_open",
            type: "text",
            label: "오픈소스 라이선스",
            value:
              "GNU Affero General Public License v3.0 (AGPL-3.0)\n본 프로그램은 모든 사용자에게 소스 코드 열람, 수정 및 배포의 자유를 보장하는 강력한 카피레프트(Copyleft) 라이선스를 따릅니다. 수정된 버전을 배포하거나 활용할 경우, 동일한 조건으로 소스 코드를 공개해야 합니다.",
            isExpandable: true,
            externalLink: {
              label: "전체 라이선스 보기 (Full License)",
              url: "https://github.com/NERDHEAD-lab/POE2-unofficial-launcher/blob/master/LICENSE",
            },
            icon: "description",
          },
        ],
      },
      {
        id: "abt_paths",
        title: "경로 정보",
        items: [
          {
            id: "btn_open_install",
            type: "button",
            label: "런처 설치 경로",
            buttonText: "폴더 열기",
            icon: "folder_shared",
            onInit: async ({ addDescription, resetDescription }) => {
              if (window.electronAPI) {
                const exePath = await window.electronAPI.getPath("exe");
                const installDir = exePath.substring(
                  0,
                  Math.max(exePath.lastIndexOf("\\"), exePath.lastIndexOf("/")),
                );
                resetDescription();
                addDescription(installDir, "info");
              }
            },
            onClickListener: async () => {
              if (window.electronAPI) {
                const exePath = await window.electronAPI.getPath("exe");
                const installDir = exePath.substring(
                  0,
                  Math.max(exePath.lastIndexOf("\\"), exePath.lastIndexOf("/")),
                );
                await window.electronAPI.openPath(installDir);
              }
            },
          },
          {
            id: "btn_open_config",
            type: "button",
            label: "설정 파일 경로",
            buttonText: "폴더 열기",
            icon: "settings_system_daydream",
            onInit: async ({ addDescription, resetDescription }) => {
              if (window.electronAPI) {
                const userDataPath =
                  await window.electronAPI.getPath("userData");
                resetDescription();
                addDescription(userDataPath, "info");
              }
            },
            onClickListener: async () => {
              if (window.electronAPI) {
                const userDataPath =
                  await window.electronAPI.getPath("userData");
                await window.electronAPI.openPath(userDataPath);
              }
            },
          },
        ],
      },
    ],
  },
];
