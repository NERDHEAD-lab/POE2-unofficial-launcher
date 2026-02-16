import React, { useMemo, useState, useEffect } from "react";

import "./SupportLinks.css";
import { AppConfig } from "../../shared/types";
import { SUPPORT_URLS } from "../../shared/urls";
import { VersionService, RemoteVersions } from "../services/VersionService";

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

interface SupportLinksProps {
  remoteVersions?: RemoteVersions | null;
  onForcedRepairRequest?: (versionInfo: {
    version: string;
    webRoot: string;
    timestamp: string | number;
  }) => void;
}

const SupportLinks: React.FC<SupportLinksProps> = ({
  remoteVersions,
  onForcedRepairRequest,
}) => {
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

          // Priority 1: Local Version (knownGameVersions)
          const localInfo = config.knownGameVersions?.[key];
          // Priority 2: Remote Version (latest-versions.json)
          const remoteInfo = VersionService.getRemoteVersionForGame(
            remoteVersions || null,
            gameId,
          );

          // Decision logic: Which one is "Best"?
          let activeInfo = localInfo || remoteInfo;
          if (localInfo && remoteInfo) {
            const cmp = VersionService.compareVersions(
              remoteInfo.version,
              localInfo.version,
            );
            // If remote is newer or equal, use remote. Otherwise use local.
            activeInfo = cmp >= 0 ? remoteInfo : localInfo;
          }

          if (activeInfo && activeInfo.webRoot) {
            setLabel(
              `실행 파일 강제 복구 ( ${activeInfo.version || "Unknown"} )`,
            );
            setDisabled(false);
            setOnClick(() => {
              if (onForcedRepairRequest) {
                onForcedRepairRequest({
                  version: activeInfo.version,
                  webRoot: activeInfo.webRoot,
                  timestamp: activeInfo.timestamp,
                });
              }
            });
          } else {
            setLabel("실행 파일 강제 복구 ( 알 수 없음 )");
            setDisabled(false);
            setOnClick(() => {
              if (onForcedRepairRequest) {
                // Open modal even if info is missing
                onForcedRepairRequest({
                  version: "",
                  webRoot: "",
                  timestamp: 0,
                });
              }
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
    [onForcedRepairRequest, remoteVersions],
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
