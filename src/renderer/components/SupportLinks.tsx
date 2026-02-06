import React, { useMemo } from "react";

import "./SupportLinks.css";
import { ChangelogItem } from "../../shared/types";
import { SUPPORT_URLS } from "../../shared/urls";

interface SupportLinksProps {
  onShowAllChangelogs?: (logs: ChangelogItem[]) => void;
}

interface SupportLinkItem {
  type: "link" | "separator";
  label?: string;
  icon?: string;
  url?: string;
  onClick?: () => void;
}

const SupportLinks: React.FC<SupportLinksProps> = ({ onShowAllChangelogs }) => {
  const items = useMemo<SupportLinkItem[]>(
    () => [
      {
        type: "link",
        label: "패치 노트",
        icon: "history",
        onClick: () => {
          window.electronAPI.getAllChangelogs().then((logs) => {
            onShowAllChangelogs?.(logs);
          });
        },
      },
      {
        type: "link",
        label: "기능 건의/버그 제보",
        icon: "bug_report",
        url: SUPPORT_URLS.ISSUES,
      },
      { type: "separator" },
      {
        type: "link",
        label: "후원하기",
        icon: "local_cafe",
        url: SUPPORT_URLS.DONATION,
      },
    ],
    [onShowAllChangelogs],
  );

  return (
    <div className="support-links-wrapper">
      {items.map((item, index) => {
        if (item.type === "separator") {
          return <div key={`sep-${index}`} className="support-separator" />;
        }

        return (
          <a
            key={item.label}
            href={item.url || "#"}
            target={item.url ? "_blank" : undefined}
            rel={item.url ? "noreferrer" : undefined}
            onClick={(e) => {
              if (item.onClick) {
                e.preventDefault();
                item.onClick();
              }
            }}
            className="support-link"
          >
            <span className="material-symbols-outlined support-link-icon">
              {item.icon}
            </span>
            {item.label}
          </a>
        );
      })}
    </div>
  );
};

export default SupportLinks;
