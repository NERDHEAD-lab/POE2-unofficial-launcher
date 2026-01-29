import { SettingsCategory, SettingValue } from "./types";
import { BackupMetadata } from "../../shared/types";
import imgUacTooltip from "../assets/settings/uac-tooltip.png";

const initBackupButton = async (
  {
    setValue: _setValue,
    setDescription,
    setDisabled: _setDisabled,
    setVisible,
  }: {
    setValue: (v: SettingValue) => void;
    setDescription: (d: string) => void;
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

    setDescription(desc);
  }
};

const initDevSetting = async ({
  setValue,
  setDisabled,
  setDescription: _setDescription,
  setVisible: _setVisible,
}: {
  setValue: (v: SettingValue) => void;
  setDescription: (d: string) => void;
  setDisabled: (v: boolean) => void;
  setVisible: (v: boolean) => void;
}) => {
  if (import.meta.env.VITE_SHOW_GAME_WINDOW === "true") {
    setValue(true);
    setDisabled(true);
  }
};

export const SETTINGS_CONFIG: SettingsCategory[] = [
  {
    id: "general",
    label: "일반",
    icon: "settings",
    sections: [
      {
        id: "gen_startup",
        title: "시작 설정",
        items: [
          {
            id: "autoLaunch",
            type: "switch",
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
            id: "startMinimized",
            type: "switch",
            label: "트레이로 최소화하여 실행",
            description:
              "자동 실행 시 창을 띄우지 않고 트레이 아이콘으로 시작합니다.",
            dependsOn: "autoLaunch",
            icon: "visibility_off",
          },
        ],
      },
      {
        id: "gen_action",
        items: [
          {
            id: "close_action",
            type: "radio",
            label: "닫기 설정",
            defaultValue: "minimize",
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
            id: "btn_logout",
            type: "button",
            label: "로그아웃",
            buttonText: "연동 해제",
            variant: "danger",
            description: "저장된 카카오 계정 세션 정보를 삭제합니다.",
            icon: "logout",
            onClickListener: async ({ showToast, showConfirm }) => {
              if (!window.electronAPI) return;
              showConfirm({
                title: "로그아웃 확인",
                message:
                  "카카오 계정 세션 정보를 삭제하고 로그아웃 하시겠습니까?",
                confirmText: "로그아웃",
                variant: "danger",
                onConfirm: async () => {
                  try {
                    showToast("[로그아웃] 요청 중...");
                    const success = await window.electronAPI!.logoutSession();
                    if (success) {
                      showToast("[로그아웃] 완료되었습니다.");
                    } else {
                      showToast("[로그아웃] 실패했습니다.");
                    }
                  } catch (err) {
                    console.error("[Settings] Logout error:", err);
                    showToast("[로그아웃] 오류가 발생했습니다.");
                  }
                },
              });
            },
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
            id: "uac_bypass",
            type: "switch",
            label: "DaumGameStarter UAC 우회",
            description:
              "카카오게임즈에서 게임 실행 시 매번 뜨는 UAC(사용자 계정 컨트롤) 창을 건너뜁니다.",
            defaultValue: false,
            icon: "verified_user",
            infoImage: imgUacTooltip,
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
                showToast(`[UAC 우회] ${val ? "적용 중..." : "해제 중..."}`);
                const result = val
                  ? await window.electronAPI.enableUACBypass()
                  : await window.electronAPI.disableUACBypass();

                if (result) {
                  showToast(`[UAC 우회] ${val ? "적용 완료" : "해제 완료"}`);
                } else {
                  showToast(`[UAC 우회] ${val ? "적용 실패" : "해제 실패"}`);
                }
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
            type: "switch",
            label: "패치 오류 자동 수정 (Auto Fix)",
            description:
              "게임 실행 로그에서 패치 오류가 감지되면, 확인 창 없이 즉시 복구를 진행합니다.",
            icon: "autorenew",
          },
          {
            id: "autoGameStartAfterFix",
            type: "switch",
            label: "패치 복구 후 게임 자동 시작",
            description:
              "패치 오류 자동 수정이 완료되면, 해당 서비스를 통해 게임을 자동으로 실행합니다.",
            icon: "play_circle",
            dependsOn: "autoFixPatchError",
          },
          {
            id: "backupPatchFiles",
            type: "switch",
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
              window.electronAPI?.triggerManualPatchFix("Kakao Games", "POE1");
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
              window.electronAPI?.triggerManualPatchFix("Kakao Games", "POE2");
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
              window.electronAPI?.triggerManualPatchFix("GGG", "POE1");
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
              window.electronAPI?.triggerManualPatchFix("GGG", "POE2");
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
            type: "switch",
            label: "개발자 모드 활성화",
            icon: "bug_report",
            requiresRestart: true,
            onInit: initDevSetting,
          },
          {
            id: "debug_console",
            type: "switch",
            label: "디버그 콘솔 표시",
            icon: "terminal",
            dependsOn: "dev_mode",
            onInit: initDevSetting,
          },
          {
            id: "show_inactive_windows",
            type: "switch",
            label: "비활성 윈도우 표시",
            icon: "visibility",
            dependsOn: "dev_mode",
            onInit: initDevSetting,
          },
          {
            id: "show_inactive_window_console",
            type: "switch",
            label: "비활성 윈도우 콘솔 표시",
            icon: "javascript",
            dependsOn: "dev_mode",
            onInit: initDevSetting,
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
              "MIT License - Copyright (c) 2026 NERDHEAD.\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files...",
            isExpandable: true,
            icon: "description",
          },
        ],
      },
    ],
  },
];
