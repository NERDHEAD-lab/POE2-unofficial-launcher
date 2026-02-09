import React from "react";
import ReactDOM from "react-dom";

interface ToastProps {
  message: string;
  visible: boolean;
  container?: HTMLElement | null; // User requested element appending
  variant?: "default" | "success" | "warning" | "error" | "white";
}

export const Toast: React.FC<ToastProps> = ({
  message,
  visible,
  container,
  variant = "default",
}) => {
  const content = (
    <div
      className={`shared-toast ${visible ? "visible" : ""} ${variant !== "default" ? variant : ""}`}
    >
      {message}
    </div>
  );

  // If container is provided, Portal into it. Otherwise render in-place.
  if (container) {
    return ReactDOM.createPortal(content, container);
  }
  return content;
};
