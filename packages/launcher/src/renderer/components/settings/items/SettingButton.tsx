import React from "react";

import { SettingButton } from "../../../settings/types";

interface Props {
  item: SettingButton;
  onClick: (actionId: string) => void;
}

export const ButtonItem: React.FC<Props> = ({ item, onClick }) => {
  return (
    <div className="setting-control">
      <button
        className={`setting-btn ${item.variant || "default"}`}
        onClick={() => onClick(item.actionId || "")}
        disabled={item.disabled}
      >
        {item.buttonText}
      </button>
    </div>
  );
};
