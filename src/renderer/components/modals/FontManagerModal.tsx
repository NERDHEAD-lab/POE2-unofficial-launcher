import React, { useEffect, useState, useMemo, useCallback } from "react";

import { ExternalFontImportModal } from "./ExternalFontImportModal";
import FontDetailSettingsModal from "./FontDetailSettingsModal";
import { AppConfig, UnifiedFontData } from "../../../shared/types";
import { useGameState } from "../../contexts/GameStateContext";
import { Toast } from "../ui/Toast";
import "./FontManagerModal.css";

interface FontManagerModalProps {
  isVisible: boolean;
  onClose: () => void;
  gameId: AppConfig["activeGame"];
  onOpenCatalog: () => void;
}

type ServiceKey = "Kakao Games" | "GGG";

const FontManagerModal: React.FC<FontManagerModalProps> = ({
  isVisible,
  onClose,
  gameId,
  onOpenCatalog,
}) => {
  const [fonts, setFonts] = useState<UnifiedFontData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const [assignments, setAssignments] = useState<Record<string, string | null>>(
    {},
  );
  const [selectedFontId, setSelectedFontId] = useState<string>("DEFAULT");
  const [hoveredFontId, setHoveredFontId] = useState<string | null>(null);
  const [downloadProgressMap, setDownloadProgressMap] = useState<
    Record<string, number>
  >({});

  const [toastMsg, setToastMsg] = useState("");
  const [toastVariant, setToastVariant] = useState<
    "default" | "success" | "warning" | "error" | "white"
  >("default");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingDeleteAlias, setPendingDeleteAlias] = useState("");

  const [flashCount, setFlashCount] = useState(0);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [showDetailSettings, setShowDetailSettings] = useState(false);
  const flashTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const [modalEl, setModalEl] = useState<HTMLDivElement | null>(null);
  const { getActiveGameState, syncGameState } = useGameState();

  const isKakaoRunning =
    getActiveGameState(gameId, "Kakao Games").status === "running";
  const isGGGRunning = getActiveGameState(gameId, "GGG").status === "running";

  const sortedFonts = useMemo(() => {
    return [...fonts]
      .filter((f) => !f.isUnknown)
      .sort((a, b) => {
        if (a.isDefault) return -1;
        if (b.isDefault) return 1;
        return b.createdAt - a.createdAt;
      });
  }, [fonts]);

  const unknownFonts = useMemo(() => {
    return fonts.filter((f) => f.isUnknown);
  }, [fonts]);

  const hasConflicts = unknownFonts.length > 0;

  const displayFont = useMemo(() => {
    const targetId = hoveredFontId || selectedFontId;
    return (
      fonts.find((f) => f.id === targetId) || fonts.find((f) => f.isDefault)
    );
  }, [fonts, selectedFontId, hoveredFontId]);

  const isDirty = useMemo(() => {
    return Object.entries(assignments).some(([service, fontId]) => {
      const currentAppliedFont = fonts.find((f) =>
        f.appliedServices?.includes(service),
      );
      const currentAppliedId = currentAppliedFont
        ? currentAppliedFont.id
        : "DEFAULT";
      return fontId !== currentAppliedId;
    });
  }, [assignments, fonts]);

  const fetchFonts = useCallback(async () => {
    try {
      const data = await window.electronAPI.font.getUnifiedFonts();
      setFonts(data);

      const initialAssignments: Record<string, string | null> = {
        "Kakao Games": "DEFAULT",
        GGG: "DEFAULT",
      };
      data.forEach((f) => {
        f.appliedServices?.forEach((s) => {
          initialAssignments[s] = f.id;
        });
      });
      setAssignments(initialAssignments);
    } catch (e) {
      console.error("Failed to fetch fonts", e);
    }
  }, []);

  const showToast = useCallback(
    (
      msg: string,
      variant:
        | "default"
        | "success"
        | "warning"
        | "error"
        | "white" = "default",
    ) => {
      setToastMsg(msg);
      setToastVariant(variant);
      setToastVisible(true);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToastVisible(false), 3000);
    },
    [],
  );

  const handleApply = useCallback(async () => {
    setIsLoading(true);
    setLoadingMessage("변경 사항을 시스템에 반영하고 있습니다...");
    try {
      await window.electronAPI.font.applyBatch(assignments);
      await fetchFonts();
      showToast("변경 사항이 성공적으로 적용되었습니다.", "success");
    } catch (err: unknown) {
      const error = err as Error;
      showToast(`적용 중 오류가 발생했습니다: ${error.message}`, "error");
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
    }
  }, [assignments, fetchFonts, showToast]);

  useEffect(() => {
    if (isVisible) {
      // Deferred via microtask so the synchronous setFonts/setAssignments inside
      // fetchFonts doesn't trigger a cascading render from this effect.
      void Promise.resolve().then(() => fetchFonts());
      syncGameState(gameId, "Kakao Games");
      syncGameState(gameId, "GGG");
    }
  }, [isVisible, gameId, syncGameState, fetchFonts]);

  useEffect(() => {
    const removeUpdateListener = window.electronAPI.font.onFontUpdated(() => {
      fetchFonts();
    });

    const removeProgressListener = window.electronAPI.font.onDownloadProgress(
      (data) => {
        setDownloadProgressMap((prev) => ({
          ...prev,
          [data.id]: data.progress,
        }));
      },
    );

    return () => {
      removeUpdateListener();
      removeProgressListener();
    };
  }, [fetchFonts]);

  const triggerConflictFlash = useCallback(() => {
    setFlashCount((prev) => prev + 1);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      setFlashCount(0);
    }, 600);
  }, []);

  const handleToggleAssignment = (
    e: React.MouseEvent,
    service: ServiceKey,
    fontId: string,
  ) => {
    e.stopPropagation();
    if (hasConflicts) {
      triggerConflictFlash();
      return;
    }
    if (service === "Kakao Games" && isKakaoRunning) return;
    if (service === "GGG" && isGGGRunning) return;

    setAssignments((prev) => ({
      ...prev,
      [service]: fontId,
    }));
  };

  const handleImportExternal = async () => {
    // 이제 직접 백그라운드 처리를 하지 않고 대화형 마법사를 엽니다.
    setShowImportWizard(true);
  };

  const handleCleanupExternal = async () => {
    setIsLoading(true);
    setLoadingMessage("기존 설치된 폰트를 정리하고 있습니다...");
    try {
      // 감지된 모든 서비스에 대해 수행
      const services = Array.from(
        new Set(unknownFonts.flatMap((f) => f.appliedServices || [])),
      );
      for (const serviceId of services) {
        await window.electronAPI.font.cleanupExternalFont(serviceId);
      }
      await fetchFonts();
      showToast("기본값으로 복구되었습니다.", "success");
    } catch (err: unknown) {
      const error = err as Error;
      showToast(`복구 실패: ${error.message}`, "error");
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
    }
  };

  const handleDeleteFont = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const font = fonts.find((f) => f.id === id);
    if (!font) return;

    setPendingDeleteId(id);
    setPendingDeleteAlias(font.alias);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;

    setIsLoading(true);
    setShowDeleteConfirm(false);
    try {
      await window.electronAPI.font.removeFont(pendingDeleteId);
      await fetchFonts();

      if (selectedFontId === pendingDeleteId) {
        setSelectedFontId("DEFAULT");
      }

      showToast("폰트가 삭제되었습니다.", "success");
    } catch (err) {
      console.error(err);
      showToast("삭제 중 오류가 발생했습니다.", "error");
    } finally {
      setIsLoading(false);
      setPendingDeleteId(null);
      setPendingDeleteAlias("");
    }
  };

  const startEdit = (e: React.MouseEvent, id: string, currentAlias: string) => {
    e.stopPropagation();
    if (id === "DEFAULT") return;
    setEditingId(id);
    setEditValue(currentAlias);
  };

  const submitEdit = async () => {
    if (!editingId) return;
    try {
      await window.electronAPI.font.updateAlias(editingId, editValue);
      await fetchFonts();
      showToast("별칭이 수정되었습니다.", "success");
    } catch (e: unknown) {
      const error = e as Error;
      showToast(error.message, "error");
    } finally {
      setEditingId(null);
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className={`font-modal-overlay ${isVisible ? "visible" : ""}`}
      onClick={onClose}
    >
      <div
        className={`font-modal ${isVisible ? "visible" : ""}`}
        ref={setModalEl}
        onClick={(e) => e.stopPropagation()}
      >
        <Toast
          message={toastMsg}
          visible={toastVisible}
          container={modalEl}
          variant={toastVariant}
        />

        {isLoading && (
          <div className="font-loading-overlay">
            <div className="font-loading-content">
              <div className="font-spinner"></div>
              <div className="font-loading-text">
                <h3>{loadingMessage}</h3>
              </div>
            </div>
          </div>
        )}

        <div className="font-header">
          <h2>커스텀 폰트 관리 (BETA)</h2>
          <div className="font-header-actions">
            <button
              onClick={() => setShowDetailSettings(true)}
              className="font-close-x"
              title="커스텀 폰트 상세 설정"
            >
              <span className="material-symbols-outlined">settings</span>
            </button>
            <button onClick={onClose} className="font-close-x">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        <div className="font-top-preview-section">
          {displayFont?.previewDataUrl ? (
            <div className="font-preview-img-container">
              <img
                src={displayFont.previewDataUrl}
                alt="Preview"
                className="font-preview-main-img"
              />
            </div>
          ) : (
            <span className="font-preview-placeholder">
              {displayFont?.isDefault
                ? "기본 시스템 폰트는 미리보기를 제공하지 않습니다."
                : "미리보기를 생성할 수 없는 폰트입니다."}
            </span>
          )}
          <div className="font-preview-info">
            {displayFont
              ? `${displayFont.alias} (${displayFont.originalName})`
              : "폰트를 선택해 주세요."}
          </div>
        </div>

        <div className="font-content">
          <div className="font-matrix-header">
            <span>별칭</span>
            <span>폰트명</span>
            <span>카카오게임즈</span>
            <span>GGG</span>
            <span>삭제</span>
          </div>

          <div
            className="font-list-container"
            onMouseLeave={() => setHoveredFontId(null)}
          >
            {sortedFonts.map((f) => {
              const isDefaultRow = f.id === "DEFAULT";
              const isActiveKakao = assignments["Kakao Games"] === f.id;
              const isActiveGGG = assignments["GGG"] === f.id;
              const isSelected = selectedFontId === f.id;
              const currentProgress = downloadProgressMap[f.id] || 0;
              const isDownloading =
                currentProgress > 0 && currentProgress < 100;

              return (
                <div
                  key={f.id}
                  className={`font-matrix-row ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelectedFontId(f.id)}
                  onMouseEnter={() => setHoveredFontId(f.id)}
                >
                  <div
                    className={`font-alias-cell ${isDefaultRow ? "readonly" : ""}`}
                    onClick={(e) => startEdit(e, f.id, f.alias)}
                  >
                    {editingId === f.id ? (
                      <input
                        autoFocus
                        className="font-alias-input"
                        value={editValue}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={submitEdit}
                        onKeyDown={(e) => e.key === "Enter" && submitEdit()}
                      />
                    ) : (
                      <span
                        className={`font-alias-text ${isDefaultRow ? "font-label-default" : ""}`}
                      >
                        {f.alias}
                      </span>
                    )}
                  </div>

                  <div className="font-original-name-cell">
                    <span className="font-original-name">{f.originalName}</span>
                  </div>

                  <div className="font-radio-cell">
                    {isDownloading ? (
                      <div
                        className="font-inline-progress"
                        title={`다운로드 중: ${currentProgress}%`}
                      >
                        <div
                          className="inline-progress-fill"
                          style={{ width: `${currentProgress}%` }}
                        ></div>
                      </div>
                    ) : (
                      <div
                        className={`font-radio-wrapper ${isActiveKakao ? "active" : ""} ${isKakaoRunning || hasConflicts ? "disabled" : ""}`}
                        title={
                          isKakaoRunning
                            ? "게임 실행 중에는 폰트를 변경할 수 없습니다."
                            : hasConflicts
                              ? "먼저 탐지된 외부 폰트 문제를 해결해야 합니다."
                              : ""
                        }
                        onClick={(e) =>
                          handleToggleAssignment(e, "Kakao Games", f.id)
                        }
                      >
                        <div className="font-radio-indicator"></div>
                      </div>
                    )}
                  </div>

                  <div className="font-radio-cell">
                    {isDownloading ? (
                      <div
                        className="font-inline-progress"
                        title={`다운로드 중: ${currentProgress}%`}
                      >
                        <div
                          className="inline-progress-fill"
                          style={{ width: `${currentProgress}%` }}
                        ></div>
                      </div>
                    ) : (
                      <div
                        className={`font-radio-wrapper ${isActiveGGG ? "active" : ""} ${isGGGRunning || hasConflicts ? "disabled" : ""}`}
                        title={
                          isGGGRunning
                            ? "게임 실행 중에는 폰트를 변경할 수 없습니다."
                            : hasConflicts
                              ? "먼저 탐지된 외부 폰트 문제를 해결해야 합니다."
                              : ""
                        }
                        onClick={(e) => handleToggleAssignment(e, "GGG", f.id)}
                      >
                        <div className="font-radio-indicator"></div>
                      </div>
                    )}
                  </div>

                  <div className="font-delete-cell">
                    {f.id === "DEFAULT" ? (
                      <button
                        className="font-delete-btn disabled"
                        title="게임 기본 설정으로 되돌리기 위한 항목입니다. (삭제 불가)"
                        disabled
                      >
                        <span className="material-symbols-outlined">
                          delete_forever
                        </span>
                      </button>
                    ) : (
                      <button
                        className="font-delete-btn"
                        onClick={(e) => handleDeleteFont(e, f.id)}
                      >
                        <span className="material-symbols-outlined">
                          delete
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {(isKakaoRunning || isGGGRunning) && (
          <div className="font-warning-banner running">
            <span className="material-symbols-outlined">
              running_with_errors
            </span>
            <p>
              현재 게임이 <strong>실행 중</strong>입니다. 폰트 설정을 변경하려면{" "}
              <strong>게임을 먼저 종료해 주세요.</strong>
            </p>
          </div>
        )}

        {hasConflicts ? (
          <div className="font-conflict-group">
            <div
              key={`conflict-${flashCount}`}
              className={`font-warning-banner conflict-error-card ${flashCount > 0 ? "flash" : ""}`}
            >
              <div className="banner-main-row">
                <div className="conflict-text">
                  <span className="material-symbols-outlined">warning</span>
                  <p>
                    <strong>외부 폰트 감지됨 :</strong>{" "}
                    {unknownFonts
                      .map((uf) => uf.originalName.split("\\").pop())
                      .join(", ")}
                  </p>
                </div>
                <div className="banner-actions">
                  <button
                    className="action-btn import"
                    onClick={handleImportExternal}
                  >
                    가져오기
                  </button>
                  <button
                    className="action-btn restore"
                    onClick={handleCleanupExternal}
                  >
                    기본값 복원
                  </button>
                </div>
              </div>
              <div className="banner-sub-row">
                <p>
                  - 해당 폰트가 적용되어 있을 경우 런처에서 폰트 적용이
                  불가능합니다.
                </p>
              </div>
            </div>

            <div className="font-warning-banner info-small">
              <span className="material-symbols-outlined">info</span>
              <p>
                문제가 해결된 후에도 폰트가 정상적으로 표시되지 않을 경우{" "}
                <strong>재부팅이 필요합니다.</strong>
              </p>
            </div>
          </div>
        ) : (
          <div
            className={`font-warning-banner ${isKakaoRunning || isGGGRunning ? "running" : ""}`}
          >
            <span className="material-symbols-outlined">info</span>
            <p>
              변경 사항 적용 후 게임에서 폰트가 정상적으로 표시되지 않을 경우{" "}
              <strong>재부팅이 필요합니다.</strong>
            </p>
          </div>
        )}

        <div className="font-footer">
          <div className="font-library-actions">
            <button
              className="font-btn secondary"
              onClick={onOpenCatalog}
              disabled={isLoading}
            >
              <span className="material-symbols-outlined">add_circle</span>
              <span>새 폰트 추가</span>
            </button>
            <button
              className="font-btn secondary"
              onClick={() => window.electronAPI.font.openCustomFontsFolder()}
              title="폰트 저장 폴더 열기"
            >
              <span className="material-symbols-outlined">folder_open</span>
            </button>
          </div>

          <div className="font-main-actions">
            <button
              className="font-btn primary"
              onClick={handleApply}
              disabled={!isDirty || isLoading}
            >
              <span className="material-symbols-outlined">check_circle</span>
              <span>적용</span>
            </button>
          </div>
        </div>

        {showDeleteConfirm && (
          <div
            className="confirm-overlay"
            onClick={() => setShowDeleteConfirm(false)}
          >
            <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
              <div className="confirm-header">폰트 삭제 확인</div>
              <div className="confirm-body">
                '<strong>{pendingDeleteAlias}</strong>' 항목을 정말
                삭제하시겠습니까?
                {fonts.find((f) => f.id === pendingDeleteId)?.appliedServices &&
                  fonts.find((f) => f.id === pendingDeleteId)!.appliedServices
                    .length > 0 && (
                    <div className="delete-usage-warning">
                      <span className="material-symbols-outlined">warning</span>
                      <p>
                        현재 [
                        {fonts
                          .find((f) => f.id === pendingDeleteId)!
                          .appliedServices.join(", ")}
                        ] 서비스에서 사용 중입니다. 삭제 시 해당 서비스는{" "}
                        <strong>'기본값'으로 자동 롤백</strong>됩니다.
                      </p>
                    </div>
                  )}
                <br />
                <small
                  style={{
                    color: "#888",
                    display: "inline-block",
                    marginTop: "8px",
                  }}
                >
                  (이 작업은 되돌릴 수 없습니다.)
                </small>
              </div>
              <div className="confirm-footer">
                <button
                  className="confirm-btn cancel"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  취소
                </button>
                <button className="confirm-btn primary" onClick={confirmDelete}>
                  삭제하기
                </button>
              </div>
            </div>
          </div>
        )}

        {showImportWizard && (
          <ExternalFontImportModal
            onClose={() => setShowImportWizard(false)}
            onComplete={async () => {
              setShowImportWizard(false);
              await fetchFonts();
              showToast(
                "외부 폰트를 성공적으로 가져오고 시스템을 리셋했습니다.",
                "success",
              );
            }}
          />
        )}

        <FontDetailSettingsModal
          isVisible={showDetailSettings}
          onClose={() => setShowDetailSettings(false)}
        />
      </div>
    </div>
  );
};

export default FontManagerModal;
