import React, { useState, useEffect, useMemo } from "react";

import "./ExternalFontImportModal.css";
import {
  DetectedExternalFont,
  ImportSelection,
} from "@poe2-launcher/shared/types";

interface ExternalFontImportModalProps {
  onClose: () => void;
  onComplete: () => void;
}

type WizardStep = "confirm" | "scanning" | "wizard" | "importing" | "error";

export const ExternalFontImportModal: React.FC<
  ExternalFontImportModalProps
> = ({ onClose, onComplete }) => {
  const [step, setStep] = useState<WizardStep>("confirm");
  const [detectedFonts, setDetectedFonts] = useState<DetectedExternalFont[]>(
    [],
  );
  const [selections, setSelections] = useState<
    Record<
      string,
      {
        selected: boolean;
        alias: string;
        originalName: string;
      }
    >
  >({});
  const [hoveredHash, setHoveredHash] = useState<string | null>(null);
  const [errorHeader, setErrorHeader] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const startScanning = React.useCallback(async () => {
    setStep("scanning");
    try {
      const fonts = await window.electronAPI.font.detectExternalFontsDetail();

      // 기존 라이브러리 정보를 가져와 n 번호 계산
      const library = await window.electronAPI.font.getUnifiedFonts();
      const unknownCount = library.filter((f) =>
        f.alias.includes("unknown"),
      ).length;

      const initialSelections: typeof selections = {};
      fonts.forEach((f, idx) => {
        initialSelections[f.hash] = {
          selected: true,
          alias: `가져온 폰트 (unknown_${unknownCount + idx})`,
          originalName: f.originalName || "Unknown Font",
        };
      });

      setDetectedFonts(fonts);
      setSelections(initialSelections);
      setStep("wizard");
    } catch (err: unknown) {
      const error = err as Error;
      setErrorHeader("검색 중 오류 발생");
      setErrorMessage(
        error.message || "시스템 폰트를 검색하는 중 오류가 발생했습니다.",
      );
      setStep("error");
    }
  }, []);

  // 1단계: 기존 설정 초기화 필요성 확인
  useEffect(() => {
    const checkExistingSettings = async () => {
      const applied = (await window.electronAPI.getConfig(
        "appliedFonts",
      )) as Record<string, string>;
      const hasCustomSettings =
        applied && Object.values(applied).some((id) => id && id !== "DEFAULT");

      if (!hasCustomSettings) {
        // 이미 기본값 상태라면 확인 단계 건너뛰고 바로 스캔 시작
        startScanning();
      }
    };
    checkExistingSettings();
  }, [startScanning]);

  const handleToggleSelect = (hash: string) => {
    setSelections((prev) => ({
      ...prev,
      [hash]: { ...prev[hash], selected: !prev[hash].selected },
    }));
  };

  const handleChangeAlias = (hash: string, value: string) => {
    setSelections((prev) => ({
      ...prev,
      [hash]: { ...prev[hash], alias: value },
    }));
  };

  const handleChangeOriginalName = (hash: string, value: string) => {
    setSelections((prev) => ({
      ...prev,
      [hash]: { ...prev[hash], originalName: value },
    }));
  };

  const handleImport = async () => {
    setStep("importing");
    try {
      const finalSelection: ImportSelection[] = detectedFonts
        .filter((f) => selections[f.hash]?.selected)
        .map((f) => ({
          path: f.path,
          alias: selections[f.hash].alias,
          originalName: selections[f.hash].originalName,
        }));

      await window.electronAPI.font.importSelectedExternalFonts(finalSelection);
      onComplete();
    } catch (err: unknown) {
      const error = err as Error;
      setErrorHeader("불러오기 실패");
      setErrorMessage(
        error.message || "폰트를 불러오는 중 오류가 발생했습니다.",
      );
      setStep("error");
    }
  };

  const activePreview = useMemo(() => {
    const hashToFind =
      hoveredHash || (detectedFonts.length > 0 ? detectedFonts[0].hash : null);
    return detectedFonts.find((f) => f.hash === hashToFind);
  }, [hoveredHash, detectedFonts]);

  // UI 렌더링 도우미
  const renderContent = () => {
    switch (step) {
      case "confirm":
        return (
          <div className="confirmation-step">
            <div className="warning-icon">⚠️</div>
            <h3 className="warning-title">설정 초기화 안내</h3>
            <p className="warning-desc">
              이미 런처에서 설정한 개별 폰트가 있습니다.
              <br />
              외부 폰트와 원활하게 통합하기 위해{" "}
              <em>기존 모든 서비스의 폰트 설정을 기본값(DEFAULT)으로 초기화</em>
              하고 진행합니다. 계속하시겠습니까?
            </p>
            <div className="warning-actions">
              <button className="cancel-btn" onClick={onClose}>
                취소
              </button>
              <button className="continue-btn" onClick={startScanning}>
                확인 및 계속
              </button>
            </div>
          </div>
        );

      case "scanning":
        return (
          <div className="wizard-loading">
            <div className="spinner"></div>
            <p>시스템에서 변조된 가능성이 있는 폰트를 조사 중입니다...</p>
          </div>
        );

      case "wizard":
        if (detectedFonts.length === 0) {
          return (
            <div className="confirmation-step">
              <div className="warning-icon">✅</div>
              <h3 className="warning-title">감지된 외부 폰트 없음</h3>
              <p className="warning-desc">
                이미 시스템이 깨끗하거나 수동으로 처리할 외부 폰트가 발견되지
                않았습니다.
              </p>
              <button className="import-action-btn" onClick={onClose}>
                닫기
              </button>
            </div>
          );
        }
        return (
          <>
            <div
              className={`wizard-preview-panel ${activePreview ? "active" : ""}`}
            >
              {activePreview ? (
                <div className="preview-svg-container">
                  <img src={activePreview.previewDataUrl} alt="Font Preview" />
                </div>
              ) : (
                <div className="preview-placeholder">
                  목록의 폰트를 선택하거나 호버하여 확인하세요.
                </div>
              )}
            </div>

            <div className="wizard-content">
              <table className="wizard-font-list">
                <tbody>
                  {detectedFonts.map((font) => (
                    <tr
                      key={font.hash}
                      className={`wizard-font-item ${hoveredHash === font.hash ? "selected" : ""}`}
                      onMouseEnter={() => setHoveredHash(font.hash)}
                      onMouseLeave={() => setHoveredHash(null)}
                      onClick={() => setHoveredHash(font.hash)}
                    >
                      <td>
                        <input
                          type="checkbox"
                          className="wizard-checkbox"
                          checked={selections[font.hash]?.selected || false}
                          onChange={() => handleToggleSelect(font.hash)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td>
                        <div className="wizard-input-group">
                          <span className="wizard-input-label">
                            별칭 (Alias)
                          </span>
                          <input
                            type="text"
                            className="wizard-input"
                            value={selections[font.hash]?.alias || ""}
                            onChange={(e) =>
                              handleChangeAlias(font.hash, e.target.value)
                            }
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </td>
                      <td>
                        <div className="wizard-input-group">
                          <span className="wizard-input-label">
                            원본 폰트명 (Font Name)
                          </span>
                          <input
                            type="text"
                            className="wizard-input"
                            value={selections[font.hash]?.originalName || ""}
                            placeholder="변조된 이름을 실제 이름으로 교정하세요."
                            onChange={(e) =>
                              handleChangeOriginalName(
                                font.hash,
                                e.target.value,
                              )
                            }
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </td>
                      <td className="wizard-service-cell">
                        <div className="wizard-service-badges">
                          {font.sourceServices.map((service) => (
                            <span
                              key={service}
                              className={`service-badge ${service.toLowerCase().replace(" ", "-")}`}
                            >
                              {service}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="wizard-footer">
              <div className="wizard-footer-left">
                <span className="selection-info">
                  총 {detectedFonts.length}개 중{" "}
                  {Object.values(selections).filter((s) => s.selected).length}개
                  선택됨
                </span>
              </div>
              <div className="wizard-actions">
                <button
                  className="cancel-btn"
                  style={{ marginRight: "10px" }}
                  onClick={onClose}
                >
                  취소
                </button>
                <button
                  className="import-action-btn"
                  disabled={!Object.values(selections).some((s) => s.selected)}
                  onClick={handleImport}
                >
                  선택한 폰트 가져오기 및 시스템 정화
                </button>
              </div>
            </div>
          </>
        );

      case "importing":
        return (
          <div className="wizard-loading">
            <div className="spinner"></div>
            <p>라이브러리에 등록하고 시스템을 깨끗하게 정리하고 있습니다...</p>
            <p
              style={{
                fontSize: "12px",
                color: "rgba(255,255,255,0.4)",
                marginTop: "10px",
              }}
            >
              이 작업은 약간의 시간이 소요될 수 있습니다.
            </p>
          </div>
        );

      case "error":
        return (
          <div className="confirmation-step">
            <div className="warning-icon" style={{ color: "#ff4d4d" }}>
              ❌
            </div>
            <h3 className="warning-title">{errorHeader}</h3>
            <p className="warning-desc">{errorMessage}</p>
            <button
              className="import-action-btn"
              onClick={() => setStep("wizard")}
            >
              뒤로 가기
            </button>
          </div>
        );
    }
  };

  return (
    <div className="import-wizard-overlay" onClick={onClose}>
      <div
        className="import-wizard-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="import-wizard-header">
          <div>
            <h2>외부 폰트 가져오기 마법사</h2>
            <p>
              시스템에 불법 설치된 폰트를 라이브러리로 안전하게 옮기고 충돌을
              제거합니다.
            </p>
          </div>
          <button className="close-wizard-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {renderContent()}
      </div>
    </div>
  );
};
