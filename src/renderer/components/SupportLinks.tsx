import React, { useMemo, useState, useEffect } from "react";

import "./SupportLinks.css";
import { AppConfig } from "../../shared/types";
import { SUPPORT_URLS } from "../../shared/urls";

// [New] Extensible Link Item Definition
interface SupportLinkContext {
  setLabel: (label: string) => void;
  setDisabled: (disabled: boolean) => void;
  setVisible: (visible: boolean) => void;
  setOnClick: (handler: () => void) => void; // Allow dynamic handler assignment
}

interface SupportLinkItemDef {
  id: string;
  type: "link" | "separator";
  defaultLabel?: string;
  icon?: string;
  defaultDisabled?: boolean;
  defaultVisible?: boolean;
  // Dynamic Initialization Logic
  onInit?: (context: SupportLinkContext) => Promise<void> | void;
  onClick?: () => void; // Static Handler
  refreshOn?: string[]; // [New] keys to listen for updates
}

// [New] Item Renderer Component
const SupportLinkItemRenderer: React.FC<{
  item: SupportLinkItemDef;
}> = ({ item }) => {
  const [label, setLabel] = useState(item.defaultLabel || "");
  const [disabled, setDisabled] = useState(item.defaultDisabled || false);
  const [visible, setVisible] = useState(item.defaultVisible !== false);
  const [dynamicHandler, setDynamicHandler] = useState<(() => void) | null>(
    null,
  );

  useEffect(() => {
    let mounted = true;
    let cleanupConfigListener: (() => void) | undefined;

    const runInit = () => {
      if (item.onInit) {
        item.onInit({
          setLabel: (l) => mounted && setLabel(l),
          setDisabled: (d) => mounted && setDisabled(d),
          setVisible: (v) => mounted && setVisible(v),
          setOnClick: (h) => mounted && setDynamicHandler(() => h),
        });
      }
    };

    // Initial Run
    runInit();

    // Setup Config Listener if item requires dynamic updates
    if (
      item.onInit &&
      item.refreshOn &&
      item.refreshOn.length > 0 &&
      window.electronAPI?.onConfigChange
    ) {
      cleanupConfigListener = window.electronAPI.onConfigChange(
        (key: string) => {
          if (item.refreshOn?.includes(key)) {
            if (mounted) runInit();
          }
        },
      );
    }

    return () => {
      mounted = false;
      if (cleanupConfigListener) cleanupConfigListener();
    };
  }, [item]);

  if (!visible) return null;

  if (item.type === "separator") {
    return <div className="support-separator" />;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled) return;

    if (dynamicHandler) {
      dynamicHandler();
    } else if (item.onClick) {
      item.onClick();
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`support-link ${disabled ? "disabled" : ""}`}
      style={
        disabled
          ? { opacity: 0.5, cursor: "not-allowed" }
          : { cursor: "pointer" }
      }
    >
      <span className="material-symbols-outlined support-link-icon">
        {item.icon}
      </span>
      {label}
    </div>
  );
};

const SupportLinks: React.FC = () => {
  // Define Links Configuration
  const linkDefinitions = useMemo<SupportLinkItemDef[]>(
    () => [
      {
        id: "force_restore",
        type: "link",
        icon: "build",
        defaultLabel: "실행 파일 강제 복구 ( 확인 중... )",
        defaultDisabled: true,
        refreshOn: ["activeGame", "serviceChannel", "knownGameVersions"],
        onInit: async ({ setLabel, setDisabled, setOnClick }) => {
          const config = (await window.electronAPI.getConfig()) as AppConfig;
          const gameId = config.activeGame;
          const serviceId = config.serviceChannel;
          const key = `${gameId}_${serviceId}`;
          const versionInfo = config.knownGameVersions?.[key];

          if (versionInfo && versionInfo.webRoot) {
            setLabel(
              `실행 파일 강제 복구 ( ${versionInfo.version || "Unknown"} )`,
            );
            setDisabled(false);
            setOnClick(() => {
              const confirmed = confirm(
                `[${gameId}/${serviceId}] 실행 파일을 강제 복구하시겠습니까?\n\n버전: ${
                  versionInfo.version || "Unknown"
                }\n(마지막 감지: ${new Date(
                  versionInfo.timestamp,
                ).toLocaleString()})`,
              );
              if (confirmed) {
                window.electronAPI.triggerForceRepair(serviceId, gameId);
              }
            });
          } else {
            setLabel("실행 파일 강제 복구 ( 알 수 없음 )");
            setDisabled(false);
            setOnClick(() => {
              alert(
                "복구 가능한 버전 정보가 없습니다.\n\n게임을 최소 1회 실행하여 패치 로그가 생성되어야 복구 기능을 사용할 수 있습니다.",
              );
            });
          }
        },
      },
      { id: "sep_1", type: "separator" },
      {
        id: "patch_notes",
        type: "link",
        defaultLabel: "패치 노트",
        icon: "history",
        // Helper to keep logic self-contained or use prop
        onClick: () => {
          window.electronAPI.getAllChangelogs().then((logs) => {
            const event = new CustomEvent("SHOW_CHANGELOGS", {
              detail: logs,
            });
            window.dispatchEvent(event);
          });
        },
      },
      {
        id: "issues",
        type: "link",
        defaultLabel: "기능 건의/버그 제보",
        icon: "bug_report",
        onClick: () => {
          window.open(SUPPORT_URLS.ISSUES, "_blank");
        },
      },
      { id: "sep_2", type: "separator" },
      {
        id: "donation",
        type: "link",
        defaultLabel: "후원하기",
        icon: "local_cafe",
        onClick: () => {
          window.open(SUPPORT_URLS.DONATION, "_blank");
        },
      },
    ],
    [],
  );

  return (
    <div className="support-links-wrapper">
      {linkDefinitions.map((def) => (
        <SupportLinkItemRenderer key={def.id} item={def} />
      ))}
    </div>
  );
};

export default SupportLinks;
