import React from "react";

import { SettingText } from "../../../settings/types";

interface Props {
  item: SettingText;
  isExpanded?: boolean;
  onToggleExpand?: (expanded: boolean) => void;
}

export const TextItem: React.FC<Props> = ({ item, isExpanded = false }) => {
  const isExpandable = item.isExpandable && item.value.length > 50;

  return (
    <div
      className={`setting-control text-control ${isExpanded ? "is-expanded" : ""}`}
    >
      <div
        style={{
          fontSize: "13px",
          color: "#aaa",
          whiteSpace: isExpanded ? "pre-wrap" : "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: isExpanded ? "100%" : "300px",
          width: isExpanded ? "100%" : "auto",
          textAlign: isExpanded ? "left" : "right",
          wordBreak: "break-all",
        }}
      >
        {item.value}
        {isExpandable && !isExpanded && (
          <span style={{ color: "#dfcf99", marginLeft: "5px" }}>(More)</span>
        )}
      </div>
    </div>
  );
};
