import { SettingsCategory, SettingValue } from "./types";
import { BackupMetadata } from "../../shared/types";
import imgUacTooltip from "../assets/settings/uac-tooltip.png";

const initBackupButton = async (
  {
    setValue,
    setDescription,
  }: { setValue: (v: boolean) => void; setDescription: (d: string) => void },
  service: "Kakao Games" | "GGG",
  game: "POE1" | "POE2",
) => {
  if (!window.electronAPI?.checkBackupAvailability) {
    setValue(false);
    return;
  }

  const result = await window.electronAPI.checkBackupAvailability(
    service,
    game,
  );

  if (!result) {
    setValue(false);
    return;
  }

  setValue(true);

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
}: {
  setValue: (v: SettingValue) => void;
  setDescription: (d: string) => void;
  setDisabled: (v: boolean) => void;
}) => {
  if (import.meta.env.VITE_SHOW_GAME_WINDOW === "true") {
    setValue(true);
    setDisabled(true);
  }
};

export const DUMMY_SETTINGS: SettingsCategory[] = [
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
            // [DUMMY]
            id: "run_startup",
            type: "switch",
            label: "컴퓨터 시작 시 자동 실행",
            description: "컴퓨터 시작 시 게임 런처를 자동으로 실행합니다.",
            defaultValue: false,
            icon: "power_settings_new",

            onChangeListener: (val, { showToast }) => {
              showToast(
                `[컴퓨터 시작 시 자동 실행] ${val ? "ON (켜짐)" : "OFF (꺼짐)"}`,
              );
            },
          },
        ],
      },
      {
        id: "gen_action",
        items: [
          {
            // [DUMMY]
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
            // [DUMMY]
            id: "language",
            type: "select",
            label: "런처 언어",
            defaultValue: "ko",
            options: [
              { label: "한국어 (Korean)", value: "ko" },
              { label: "English", value: "en" },
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
    id: "display",
    label: "화면",
    icon: "display_settings",
    sections: [
      {
        id: "disp_theme",
        title: "테마 및 모양",
        items: [
          {
            // [DUMMY]
            id: "ui_scale",
            type: "slider",
            label: "UI 크기 조절",
            min: 80,
            max: 120,
            step: 5,
            defaultValue: 100,
            valueFormat: (v) => `${v}%`,
            icon: "zoom_in",
            onChangeListener: (val, { showToast }) => {
              showToast(`[UI 크기 조절] 크기: ${val}%`);
            },
          },
          {
            // [DUMMY]
            id: "bg_dim",
            type: "number",
            label: "배경 밝기 조절",
            defaultValue: 50,
            min: 0,
            max: 100,
            suffix: "%",
            icon: "brightness_medium",
            onChangeListener: (val, { showToast }) => {
              showToast(`[배경 밝기 조절] 밝기: ${val}%`);
            },
          },
        ],
      },
    ],
  },
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
            // [DUMMY]
            id: "kakao_auto_login",
            type: "switch",
            label: "자동 로그인 사용",
            defaultValue: true,
            icon: "login",
            onChangeListener: (val, { showToast }) => {
              showToast(
                `[자동 로그인 사용] ${val ? "ON (활성화)" : "OFF (비활성화)"}`,
              );
            },
          },
          {
            id: "btn_logout",
            type: "button",
            label: "로그아웃",
            buttonText: "연동 해제",
            actionId: "logout_kakao",
            variant: "danger",
            description: "저장된 카카오 계정 세션 정보를 삭제합니다.",
            icon: "logout",
          },
        ],
      },
    ],
  },
  {
    id: "notification",
    label: "알림",
    icon: "notifications_active",
    sections: [
      {
        id: "noti_general",
        items: [
          {
            // [DUMMY]
            id: "noti_patch",
            type: "switch",
            label: "업데이트 알림 받기",
            defaultValue: true,
            icon: "system_update",
            onChangeListener: (val, { showToast }) => {
              showToast(`[업데이트 알림] ${val ? "수신 (ON)" : "거부 (OFF)"}`);
            },
          },
          {
            // [DUMMY]
            id: "noti_server",
            type: "switch",
            label: "서버 점검 알림",
            defaultValue: true,
            icon: "dns",
            onChangeListener: (val, { showToast }) => {
              showToast(`[서버 점검 알림] ${val ? "수신 (ON)" : "거부 (OFF)"}`);
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
        id: "adv_process",
        title: "프로세스 관리",
        items: [
          {
            id: "uac_bypass",
            type: "switch",
            label: "DaumGameStarter UAC 우회",
            description:
              "게임 실행 시 매번 뜨는 UAC(사용자 계정 컨트롤) 창을 건너뜁니다.",
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
            defaultValue: false,
            icon: "autorenew",
          },
          {
            id: "autoGameStartAfterFix",
            type: "switch",
            label: "패치 복구 후 게임 자동 시작",
            description:
              "패치 오류 자동 수정이 완료되면, 해당 서비스를 통해 게임을 자동으로 실행합니다.",
            defaultValue: false,
            icon: "play_circle",
            dependsOn: "autoFixPatchError",
          },
          {
            id: "backupPatchFiles",
            type: "switch",
            label: "패치 파일 백업 (Backup)",
            description:
              "패치 파일 교체 시 원본 파일을 안전한 곳(.patch_backups)에 보관합니다.",
            defaultValue: true,
            icon: "save",
          },
          // Restore Buttons (Conditional based on logic, but here statically defined for now)
          {
            id: "restore_kakao_poe1",
            type: "button",
            label: "카카오 POE1 복구",
            buttonText: "복구 실행",
            actionId: "restore_backup_kakao_poe1",
            icon: "history",
            dependsOn: "backupPatchFiles", // UI toggle dependency only
            onInit: (context) =>
              initBackupButton(context, "Kakao Games", "POE1"),
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
          },
        ],
      },
      {
        id: "adv_debug",
        title: "디버깅",
        items: [
          {
            id: "dev_mode",
            type: "switch",
            label: "개발자 모드 활성화",
            defaultValue: false,
            icon: "bug_report",
            requiresRestart: true,
            onInit: initDevSetting,
          },
          {
            id: "debug_console",
            type: "switch",
            label: "디버그 콘솔 표시",
            defaultValue: false,
            icon: "terminal",
            dependsOn: "dev_mode",
            requiresRestart: true,
            onInit: initDevSetting,
          },
          {
            id: "show_inactive_windows",
            type: "switch",
            label: "비활성 윈도우 표시",
            defaultValue: false,
            icon: "visibility",
            dependsOn: "dev_mode",
            requiresRestart: true,
            onInit: initDevSetting,
          },
          {
            id: "show_inactive_window_console",
            type: "switch",
            label: "비활성 윈도우 콘솔 표시",
            defaultValue: false,
            icon: "javascript",
            dependsOn: "dev_mode",
            requiresRestart: true,
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
            // [DUMMY]
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
