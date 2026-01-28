import React from "react";

import { SettingText } from "../../../settings/types";

interface Props {
  item: SettingText;
  value?: string;
  isExpanded?: boolean;
  onToggleExpand?: (expanded: boolean) => void;
}

export const TextItem: React.FC<Props> = ({
  item,
  value,
  isExpanded = false,
}) => {
  const displayValue = value ?? item.value;
  const isExpandable = item.isExpandable && displayValue.length > 50;

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
        {displayValue}
        {isExpandable && !isExpanded && (
          <span style={{ color: "#dfcf99", marginLeft: "5px" }}>(More)</span>
        )}
      </div>
    </div>
  );
};
