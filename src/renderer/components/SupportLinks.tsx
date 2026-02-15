import React, { useMemo, useState, useEffect } from "react";

import "./SupportLinks.css";
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
  url?: string;
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
    <a
      href={item.url || "#"}
      target={item.url ? "_blank" : undefined}
      rel={item.url ? "noreferrer" : undefined}
      onClick={handleClick}
      className={`support-link ${disabled ? "disabled" : ""}`}
      style={disabled ? { opacity: 0.5, cursor: "not-allowed" } : {}}
    >
      <span className="material-symbols-outlined support-link-icon">
        {item.icon}
      </span>
      {label}
    </a>
  );
};

const SupportLinks: React.FC = () => {
  // Define Links Configuration
  const linkDefinitions = useMemo<SupportLinkItemDef[]>(
    () => [
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
        url: SUPPORT_URLS.ISSUES,
      },
      { id: "sep_2", type: "separator" },
      {
        id: "donation",
        type: "link",
        defaultLabel: "후원하기",
        icon: "local_cafe",
        url: SUPPORT_URLS.DONATION,
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
