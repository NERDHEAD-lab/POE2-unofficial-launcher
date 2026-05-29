import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { buildPobErrorReport } from "./pobErrorReport";

import type { PobErrorReportInput } from "./pobErrorReport";

export interface PobErrorBannerProps extends PobErrorReportInput {
  className?: string;
  copyable?: boolean;
  dismissible?: boolean;
  onDismiss?: () => void;
}

export function PobErrorBanner({
  message,
  source,
  details,
  context,
  timestamp,
  className,
  copyable = true,
  dismissible = false,
  onDismiss,
}: PobErrorBannerProps) {
  const { t } = useTranslation();
  const [copyState, setCopyState] = useState<"copied" | "failed" | null>(null);
  const report = useMemo(
    () => buildPobErrorReport({ message, source, details, context, timestamp }),
    [context, details, message, source, timestamp],
  );
  const showActions = copyable || dismissible;

  const copyReport = async () => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(report);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <div
      className={"pob-error" + (className ? ` ${className}` : "")}
      role="alert"
    >
      <div className="pob-error-body">
        <span className="pob-error-message">{message}</span>
        {copyState && (
          <span className="pob-error-copy-status" role="status">
            {copyState === "copied"
              ? t("pobError.copySucceeded")
              : t("pobError.copyFailed")}
          </span>
        )}
      </div>
      {showActions && (
        <div className="pob-error-actions">
          {copyable && (
            <button
              type="button"
              className="pob-error-action"
              onClick={() => void copyReport()}
              aria-label={t("pobError.copy")}
              title={t("pobError.copy")}
            >
              <span className="material-symbols-outlined" aria-hidden>
                content_copy
              </span>
            </button>
          )}
          {dismissible && (
            <button
              type="button"
              className="pob-error-action"
              onClick={onDismiss}
              aria-label={t("pobError.dismiss")}
              title={t("pobError.dismiss")}
            >
              <span className="material-symbols-outlined" aria-hidden>
                close
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
