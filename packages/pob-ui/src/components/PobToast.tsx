export type PobToastVariant = "info" | "success" | "error";

interface PobToastProps {
  message: string;
  visible: boolean;
  variant?: PobToastVariant;
}

export function PobToast({
  message,
  visible,
  variant = "info",
}: PobToastProps) {
  if (!message) {
    return null;
  }

  return (
    <div
      className={`pob-window-toast is-${variant}${visible ? " is-visible" : ""}`}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
