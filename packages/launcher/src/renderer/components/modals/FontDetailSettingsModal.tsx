import React, { useEffect, useMemo, useState } from "react";

import "./FontDetailSettingsModal.css";

interface FontDetailSettingsModalProps {
  isVisible: boolean;
  onClose: () => void;
}

const SCALE_MIN = 50;
const SCALE_MAX = 150;
const SCALE_DEFAULT = 100;

type Phase = "edit" | "discardConfirm" | "applyNotice" | "applying" | "error";

const clampScale = (v: unknown): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : SCALE_DEFAULT;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(n)));
};

/**
 * 커스텀 폰트 상세 설정 (STEP 2: 실제 연결)
 *
 * - 열릴 때 저장된 fontScaleNoto/fontScaleSpoqa 로드
 * - "확인": 변경 없으면 닫기 / 변경 있으면 재설치 안내 → 설정 저장 +
 *   font.reapply() (적용된 커스텀 폰트를 새 scale로 재변조·재설치) → 닫기
 * - "취소"/X/오버레이: 변경 있으면 폐기 확인
 */
const FontDetailSettingsModal: React.FC<FontDetailSettingsModalProps> = ({
  isVisible,
  onClose,
}) => {
  const [appliedNoto, setAppliedNoto] = useState(SCALE_DEFAULT);
  const [appliedSpoqa, setAppliedSpoqa] = useState(SCALE_DEFAULT);
  const [draftNoto, setDraftNoto] = useState(SCALE_DEFAULT);
  const [draftSpoqa, setDraftSpoqa] = useState(SCALE_DEFAULT);

  const [phase, setPhase] = useState<Phase>("edit");
  const [errorMsg, setErrorMsg] = useState("");

  // 모달이 열릴 때 저장된 설정 로드
  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;
    (async () => {
      const [noto, spoqa] = await Promise.all([
        window.electronAPI.getConfig("fontScaleNoto"),
        window.electronAPI.getConfig("fontScaleSpoqa"),
      ]);
      if (cancelled) return;
      const n = clampScale(noto);
      const s = clampScale(spoqa);
      setAppliedNoto(n);
      setAppliedSpoqa(s);
      setDraftNoto(n);
      setDraftSpoqa(s);
      setPhase("edit");
    })();
    return () => {
      cancelled = true;
    };
  }, [isVisible]);

  const notoDirty = draftNoto !== appliedNoto;
  const spoqaDirty = draftSpoqa !== appliedSpoqa;
  const isDirty = useMemo(
    () => notoDirty || spoqaDirty,
    [notoDirty, spoqaDirty],
  );

  const resetDefaults = () => {
    setDraftNoto(SCALE_DEFAULT);
    setDraftSpoqa(SCALE_DEFAULT);
  };

  const finishClose = () => {
    setPhase("edit");
    onClose();
  };

  // "확인": 변경 없으면 닫기, 있으면 재설치 안내로
  const handleConfirm = () => {
    if (!isDirty) {
      finishClose();
      return;
    }
    setPhase("applyNotice");
  };

  // 재설치 안내에서 진행 → 설정 저장 + 폰트 재변조·재설치 → 닫기
  const handleProceedApply = async () => {
    setPhase("applying");
    try {
      await window.electronAPI.setConfig("fontScaleNoto", draftNoto);
      await window.electronAPI.setConfig("fontScaleSpoqa", draftSpoqa);
      await window.electronAPI.font.reapply();
      setAppliedNoto(draftNoto);
      setAppliedSpoqa(draftSpoqa);
      finishClose();
    } catch (e) {
      setErrorMsg(
        e instanceof Error ? e.message : "폰트 재설치 중 오류가 발생했습니다.",
      );
      setPhase("error");
    }
  };

  const requestClose = () => {
    if (phase === "applying") return; // 적용 중 닫기 차단
    if (isDirty) {
      setPhase("discardConfirm");
    } else {
      finishClose();
    }
  };

  const confirmDiscard = () => {
    setDraftNoto(appliedNoto);
    setDraftSpoqa(appliedSpoqa);
    finishClose();
  };

  return (
    <div
      className={`fds-overlay ${isVisible ? "visible" : ""}`}
      onClick={requestClose}
    >
      <div className="fds-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fds-header">
          <h2>커스텀 폰트 상세 설정</h2>
          <button onClick={requestClose} className="fds-close-x">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="fds-body">
          {/* Noto Sans CJK TC */}
          <section className="fds-font-block">
            <div className={`fds-font-title ${notoDirty ? "dirty" : ""}`}>
              Noto Sans CJK TC
            </div>
            <div className="fds-slider-row">
              <span className="fds-slider-label">크기</span>
              <span className="fds-slider-min">{SCALE_MIN}%</span>
              <input
                type="range"
                min={SCALE_MIN}
                max={SCALE_MAX}
                step={5}
                value={draftNoto}
                onChange={(e) => setDraftNoto(Number(e.target.value))}
                className="fds-slider"
              />
              <span className="fds-slider-max">{SCALE_MAX}%</span>
              <span className={`fds-slider-value ${notoDirty ? "dirty" : ""}`}>
                {draftNoto}%
              </span>
            </div>
            <div className="fds-desc-box">
              POE2 전용 — NPC 대화창, 스토리·퀘스트 텍스트, 신규 UI 패널의 한글
              렌더링
            </div>
          </section>

          {/* Spoqa Han Sans Neo */}
          <section className="fds-font-block">
            <div className={`fds-font-title ${spoqaDirty ? "dirty" : ""}`}>
              Spoqa Han Sans Neo
            </div>
            <div className="fds-slider-row">
              <span className="fds-slider-label">크기</span>
              <span className="fds-slider-min">{SCALE_MIN}%</span>
              <input
                type="range"
                min={SCALE_MIN}
                max={SCALE_MAX}
                step={5}
                value={draftSpoqa}
                onChange={(e) => setDraftSpoqa(Number(e.target.value))}
                className="fds-slider"
              />
              <span className="fds-slider-max">{SCALE_MAX}%</span>
              <span className={`fds-slider-value ${spoqaDirty ? "dirty" : ""}`}>
                {draftSpoqa}%
              </span>
            </div>
            <div className="fds-desc-box">
              POE1 한글 전체 / POE2 아이템 툴팁·이름, HUD·버프·스킬 UI, 채팅창
            </div>
          </section>

          <p className="fds-note">
            ※ POE1은 Spoqa만, POE2는 Noto·Spoqa 둘 다 교체해야 전체 한글이
            적용됩니다.
          </p>
        </div>

        <div className="fds-footer">
          <button className="fds-btn ghost" onClick={resetDefaults}>
            기본값 복원
          </button>
          <div className="fds-footer-spacer" />
          <button className="fds-btn secondary" onClick={requestClose}>
            취소
          </button>
          <button className="fds-btn primary" onClick={handleConfirm}>
            확인
          </button>
        </div>

        {phase === "discardConfirm" && (
          <div className="fds-confirm-overlay" onClick={() => setPhase("edit")}>
            <div
              className="fds-confirm-box"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="fds-confirm-header">변경사항 폐기</div>
              <p className="fds-confirm-text">
                적용하지 않은 변경사항이 있습니다. 폐기하고 닫을까요?
              </p>
              <div className="fds-confirm-actions">
                <button
                  className="fds-btn secondary"
                  onClick={() => setPhase("edit")}
                >
                  계속 편집
                </button>
                <button className="fds-btn danger" onClick={confirmDiscard}>
                  폐기하고 닫기
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === "applyNotice" && (
          <div className="fds-confirm-overlay" onClick={() => setPhase("edit")}>
            <div
              className="fds-confirm-box"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="fds-confirm-header">폰트 재설치 필요</div>
              <p className="fds-confirm-text">
                변경된 크기를 적용하려면 이미 설치된 커스텀 폰트를 수정 후 다시
                설치합니다. 진행할까요?
              </p>
              <div className="fds-confirm-actions">
                <button
                  className="fds-btn secondary"
                  onClick={() => setPhase("edit")}
                >
                  취소
                </button>
                <button
                  className="fds-btn primary"
                  onClick={handleProceedApply}
                >
                  적용하고 재설치
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === "applying" && (
          <div className="fds-confirm-overlay">
            <div className="fds-loading-box">
              <div className="fds-spinner" />
              <p className="fds-loading-text">
                폰트를 수정하고 다시 설치하는 중입니다…
              </p>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="fds-confirm-overlay">
            <div className="fds-confirm-box">
              <div className="fds-confirm-header">적용 실패</div>
              <p className="fds-confirm-text">{errorMsg}</p>
              <div className="fds-confirm-actions">
                <button
                  className="fds-btn secondary"
                  onClick={() => setPhase("edit")}
                >
                  닫기
                </button>
                <button
                  className="fds-btn primary"
                  onClick={handleProceedApply}
                >
                  다시 시도
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FontDetailSettingsModal;
