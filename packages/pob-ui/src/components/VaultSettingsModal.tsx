import React from "react";
import { useTranslation } from "react-i18next";

import {
  POB_VAULT_GENERATION_MAX,
  POB_VAULT_GENERATION_MIN,
} from "@poe2-launcher/shared/pobSettings";
import type {
  PobSettings,
  PobVaultGenerationSnapshot,
  PobVaultRefreshSnapshot,
} from "@poe2-launcher/shared/types";

import {
  formatVaultSize,
  formatVaultTimestamp,
} from "../utils/vaultSettingsFormat";

export type VaultGenerationsState =
  | { status: "idle" | "loading"; generations: [] }
  | { status: "ready"; generations: PobVaultGenerationSnapshot[] }
  | { status: "error"; generations: []; reason: string };

export type VaultRefreshState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ready"; result: PobVaultRefreshSnapshot }
  | { status: "error"; reason: string };

interface VaultSettingsModalProps {
  settings: PobSettings;
  generationsState: VaultGenerationsState;
  refreshState: VaultRefreshState;
  onSettingsChange: (settings: Partial<PobSettings>) => void;
  onReloadGenerations: () => void;
  onForceRefresh: () => void;
  onClose: () => void;
}

const VAULT_REFRESH_LABEL_KEYS: Record<
  PobVaultRefreshSnapshot["status"],
  string
> = {
  "up-to-date": "settings.refresh.status.upToDate",
  "update-available": "settings.refresh.status.updateAvailable",
  promoted: "settings.refresh.status.promoted",
  fallback: "settings.refresh.status.fallback",
};

export const VaultSettingsModal: React.FC<VaultSettingsModalProps> = ({
  settings,
  generationsState,
  refreshState,
  onSettingsChange,
  onReloadGenerations,
  onForceRefresh,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <div className="pob-modal-overlay" onClick={onClose}>
      <div
        className="pob-modal pob-vault-settings-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pob-vault-settings-header">
          <h3>{t("settings.title")}</h3>
          <button
            className="pob-window-btn"
            onClick={onClose}
            title={t("window.close")}
          >
            &#10005;
          </button>
        </div>

        <section className="pob-vault-settings-section">
          <label className="pob-vault-settings-check">
            <input
              type="checkbox"
              checked={settings.autoVaultUpdate}
              onChange={(event) =>
                onSettingsChange({ autoVaultUpdate: event.target.checked })
              }
            />
            <span>{t("settings.autoVaultUpdate")}</span>
          </label>

          <label className="pob-vault-settings-field">
            <span>{t("settings.vaultGenerationLimit")}</span>
            <input
              type="number"
              min={POB_VAULT_GENERATION_MIN}
              max={POB_VAULT_GENERATION_MAX}
              value={settings.vaultGenerationLimit}
              onChange={(event) =>
                onSettingsChange({
                  vaultGenerationLimit: Number(event.target.value),
                })
              }
            />
          </label>
          <p className="pob-vault-settings-help">
            {t("settings.vaultGenerationHelp")}
          </p>

          <div className="pob-vault-settings-actions">
            <button
              className="pob-btn pob-btn-primary"
              disabled={refreshState.status === "running"}
              onClick={onForceRefresh}
            >
              {refreshState.status === "running"
                ? t("settings.refresh.running")
                : t("settings.refresh.force")}
            </button>
          </div>

          {refreshState.status === "ready" && (
            <div
              className={
                "pob-vault-refresh-result" +
                (refreshState.result.status === "fallback" ? " is-error" : "")
              }
            >
              <strong>
                {t(VAULT_REFRESH_LABEL_KEYS[refreshState.result.status])}
              </strong>
              {refreshState.result.error && (
                <span>{refreshState.result.error}</span>
              )}
              {refreshState.result.smokeTest && (
                <ol>
                  {refreshState.result.smokeTest.steps.map((step) => (
                    <li key={step.id} className={step.ok ? "" : "is-error"}>
                      <span>{step.label}</span>
                      <span>{step.ok ? t("settings.refresh.ok") : "-"}</span>
                      {step.detail && <small>{step.detail}</small>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
          {refreshState.status === "error" && (
            <div className="pob-error">
              {t("settings.refresh.error", { reason: refreshState.reason })}
            </div>
          )}
        </section>

        <section className="pob-vault-settings-section">
          <div className="pob-vault-settings-row">
            <h4>{t("settings.generations")}</h4>
            <div className="pob-vault-settings-actions">
              <button className="pob-btn" onClick={onReloadGenerations}>
                {t("settings.reload")}
              </button>
            </div>
          </div>

          {generationsState.status === "loading" && (
            <div className="pob-list-empty">
              {t("settings.generations.loading")}
            </div>
          )}
          {generationsState.status === "error" && (
            <div className="pob-error">
              {t("settings.generations.error", {
                reason: generationsState.reason,
              })}
            </div>
          )}
          {generationsState.status === "ready" &&
            generationsState.generations.length === 0 && (
              <div className="pob-list-empty">
                {t("settings.generations.empty")}
              </div>
            )}
          {generationsState.status === "ready" &&
            generationsState.generations.length > 0 && (
              <div className="pob-vault-generations">
                {generationsState.generations.map((generation) => (
                  <div
                    className="pob-vault-generation"
                    key={generation.version}
                  >
                    <div className="pob-vault-generation-main">
                      <strong>{generation.version}</strong>
                      {generation.active && (
                        <span className="pob-vault-generation-active">
                          {t("settings.generations.active")}
                        </span>
                      )}
                    </div>
                    <dl>
                      <div>
                        <dt>{t("settings.generations.size")}</dt>
                        <dd>{formatVaultSize(generation.sizeBytes)}</dd>
                      </div>
                      <div>
                        <dt>{t("settings.generations.copiedAt")}</dt>
                        <dd>
                          {formatVaultTimestamp(generation.copiedAt, "-")}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("settings.generations.smokeTestPassedAt")}</dt>
                        <dd>
                          {formatVaultTimestamp(
                            generation.smokeTestPassedAt,
                            "-",
                          )}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            )}
        </section>
      </div>
    </div>
  );
};
