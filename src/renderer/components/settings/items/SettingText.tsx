import React, { useState } from "react";

import { SettingText } from "../../../settings/types";

interface Props {
  item: SettingText;
}

export const TextItem: React.FC<Props> = ({ item }) => {
  const [expanded, setExpanded] = useState(false);
  const isExpandable = item.isExpandable && item.value.length > 50;

  return (
    <div className="setting-control text-control">
      <div
        style={{
          fontSize: "13px",
          color: "#aaa",
          whiteSpace: expanded ? "pre-wrap" : "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: expanded ? "100%" : "300px",
          cursor: isExpandable ? "pointer" : "default",
        }}
        onClick={() => isExpandable && setExpanded(!expanded)}
      >
        {item.value}
        {isExpandable && !expanded && (
          <span style={{ color: "#dfcf99", marginLeft: "5px" }}>(More)</span>
        )}
      </div>
    </div>
  );
};
