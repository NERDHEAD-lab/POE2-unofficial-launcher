import React, { useState, useEffect } from "react";

import "./OnboardingModal.css";
import imgUacTooltip from "../../assets/settings/uac-tooltip.png";

interface Props {
  isOpen: boolean;
  onFinish: () => void;
}

export const OnboardingModal: React.FC<Props> = ({ isOpen, onFinish }) => {
  const [step, setStep] = useState(1);
  const [uacBypass, setUacBypass] = useState(false);

  // [New] Patch & Automation States
  const [autoFix, setAutoFix] = useState(false);
  const [autoStart, setAutoStart] = useState(false);
  const [backup, setBackup] = useState(true);

  useEffect(() => {
    if (isOpen && window.electronAPI) {
      window.electronAPI.isUACBypassEnabled().then(setUacBypass);

      // Load initial config
      window.electronAPI
        .getConfig("autoFixPatchError")
        .then((v) => setAutoFix(!!v));
      window.electronAPI
        .getConfig("autoGameStartAfterFix")
        .then((v) => setAutoStart(!!v));
      window.electronAPI
        .getConfig("backupPatchFiles")
        .then((v) => setBackup(!!v));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleNext = () => setStep((s) => s + 1);
  const handlePrev = () => setStep((s) => s - 1);

  const handleToggleUAC = async () => {
    if (!window.electronAPI) return;
    const nextVal = !uacBypass;
    const result = nextVal
      ? await window.electronAPI.enableUACBypass()
      : await window.electronAPI.disableUACBypass();
    if (result) setUacBypass(nextVal);
  };

  const handleToggleConfig = async (
    key: string,
    currentVal: boolean,
    setter: (v: boolean) => void,
  ) => {
    if (!window.electronAPI) return;
    const nextVal = !currentVal;
    await window.electronAPI.setConfig(key, nextVal);
    setter(nextVal);
  };

  const handleFinish = () => {
    onFinish();
    // [Review] Force save onboarding shown state just in case
    if (window.electronAPI) {
      window.electronAPI.setConfig("showOnboarding", false);
    }
  };

  return (
    <div className="onboarding-modal-overlay">
      <div className="onboarding-modal-content">
        <div className="onboarding-header">
          <div className="icon">
            <span className="material-symbols-outlined">
              {step === 1
                ? "info"
                : step === 2
                  ? "verified_user"
                  : step === 3
                    ? "build_circle"
                    : "rocket_launch"}
            </span>
          </div>
          <div className="header-text">
            <h2>
              {step === 1
                ? "런처 시작 안내 및 고지"
                : step === 2
                  ? "DaumGameStarter 권한 설정"
                  : step === 3
                    ? "패치 복구 설정"
                    : "설정 완료"}
            </h2>
            <div className="step-indicator">단계 {step} / 4</div>
          </div>
        </div>

        <div className="onboarding-body">
          {step === 1 && (
            <div className="step-content">
              <section className="notice-section">
                <h3>📊 서비스 수집 및 안내</h3>
                <p>
                  앱의 서비스 개선 및 통계 분석을 위해 MAU 등의 익명 데이터가
                  수집될 수 있습니다. 또한, 안정적인 서비스 유지를 위해 추후 앱
                  우측 영역에 소정의 광고가 포함될 수 있음을 안내드립니다.
                </p>
              </section>

              <section className="notice-section">
                <h3>🔄 업데이트 관련 안내</h3>
                <p>
                  현재 프로그램의 코드 서명 인증서가 발급되지 않아, 윈도우 보안
                  정책에 의해 백그라운드 자동 업데이트가 제한될 수 있습니다.
                  (Defender 알림 발생)
                </p>
                <p className="sub-text">
                  인증서 발급에는 상당한 유지 비용이 발생하며, 사용자 기반이
                  확보되는 대로 발급을 진행하여 더욱 편리한 업데이트 환경을
                  제공할 예정입니다.
                </p>
              </section>

              <section className="notice-section highlight">
                <h3>⚠️ 기존 사용자 주의사항</h3>
                <p>
                  기존에 <strong>'POE2 Kakao Patch Butler'</strong>를
                  사용하셨다면, 충돌 방지를 위해 해당 툴의 모든 옵션을
                  비활성화하고 삭제한 뒤 본 런처를 이용해 주시기 바랍니다.
                </p>
              </section>
            </div>
          )}

          {step === 2 && (
            <div className="step-content">
              <div className="uac-explanation">
                <p>
                  카카오게임즈에서 게임 실행 시 매번 나타나는{" "}
                  <strong>UAC(사용자 계정 컨트롤) 확인 창</strong>을
                  건너뛰시겠습니까?
                </p>
                <p className="sub-text">
                  이 설정은 윈도우 스케줄러를 사용하는 안전한 방식(UAC
                  Bypass)으로 동작합니다.
                </p>
              </div>

              {!uacBypass && (
                <div
                  className="notice-section highlight"
                  style={{
                    marginTop: "12px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                  onClick={() =>
                    window.electronAPI?.openExternal(
                      "https://gcdn.pcpf.kakaogames.com/static/daum/starter/download.html",
                    )
                  }
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "18px", color: "#fa5252" }}
                  >
                    warning
                  </span>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "12px",
                      color: "#eee",
                      textDecoration: "underline",
                      textUnderlineOffset: "2px",
                    }}
                  >
                    활성화가 되지 않을 경우, 여기를 클릭하여 DaumGameStarter를
                    재설치하고 다시 시도해 주세요.
                  </p>
                </div>
              )}

              <div
                className={`uac-card ${uacBypass ? "active" : ""}`}
                onClick={handleToggleUAC}
              >
                <div className="uac-card-info">
                  <span className="material-symbols-outlined">
                    {uacBypass ? "verified_user" : "security"}
                  </span>
                  <div className="uac-card-text">
                    <div className="uac-card-title">
                      DaumGameStarter UAC 우회
                    </div>
                    <div className="uac-card-desc">
                      {uacBypass
                        ? "현재 적용됨 (실행 시 창 안뜸)"
                        : "클릭하여 활성화 (실행 시 창 안뜸)"}
                    </div>
                  </div>
                </div>
                <div className={`uac-toggle ${uacBypass ? "is-active" : ""}`}>
                  <div className="toggle-knob"></div>
                </div>
              </div>

              <div className="uac-preview-container">
                <img
                  src={imgUacTooltip}
                  alt="UAC Preview"
                  className="uac-preview-img"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="step-content">
              <div className="uac-explanation">
                <p>
                  게임 실행에 문제가 생겼을 때(패치 오류 등), 런처가
                  <strong>자동으로 복구</strong>하도록 설정하시겠습니까?
                </p>
              </div>

              {/* 1. Auto Fix Patch Error */}
              <div
                className={`uac-card ${autoFix ? "active" : ""}`}
                onClick={() =>
                  handleToggleConfig("autoFixPatchError", autoFix, setAutoFix)
                }
              >
                <div className="uac-card-info">
                  <span className="material-symbols-outlined">autorenew</span>
                  <div className="uac-card-text">
                    <div className="uac-card-title">
                      패치 오류 자동 수정 (Auto Fix)
                    </div>
                    <div className="uac-card-desc">
                      게임 실행 로그에서 패치 오류가 감지되면, 확인 창 없이 즉시
                      복구를 진행합니다.
                    </div>
                  </div>
                </div>
                <div className={`uac-toggle ${autoFix ? "is-active" : ""}`}>
                  <div className="toggle-knob"></div>
                </div>
              </div>

              {/* 2. Auto Start Game (Depends on Auto Fix) */}
              <div
                className={`uac-card ${autoFix && autoStart ? "active" : ""} ${!autoFix ? "disabled" : ""}`}
                style={{
                  opacity: autoFix ? 1 : 0.5,
                  pointerEvents: autoFix ? "auto" : "none",
                  marginLeft: "20px",
                  marginTop: "10px",
                }}
                onClick={() =>
                  autoFix &&
                  handleToggleConfig(
                    "autoGameStartAfterFix",
                    autoStart,
                    setAutoStart,
                  )
                }
              >
                <div className="uac-card-info">
                  <span className="material-symbols-outlined">play_circle</span>
                  <div className="uac-card-text">
                    <div className="uac-card-title">
                      패치 복구 후 게임 자동 시작
                    </div>
                    <div className="uac-card-desc">
                      패치 오류 자동 수정이 완료되면, 해당 서비스를 통해 게임을
                      자동으로 실행합니다.
                    </div>
                  </div>
                </div>
                <div className={`uac-toggle ${autoStart ? "is-active" : ""}`}>
                  <div className="toggle-knob"></div>
                </div>
              </div>

              {/* 3. Backup Patch Files */}
              <div
                className={`uac-card ${backup ? "active" : ""}`}
                style={{ marginTop: "20px" }}
                onClick={() =>
                  handleToggleConfig("backupPatchFiles", backup, setBackup)
                }
              >
                <div className="uac-card-info">
                  <span className="material-symbols-outlined">save</span>
                  <div className="uac-card-text">
                    <div className="uac-card-title">
                      패치 파일 백업 (Backup)
                    </div>
                    <div className="uac-card-desc">
                      패치 파일 교체 시 원본 파일을 안전한 곳(.patch_backups)에
                      보관합니다.
                    </div>
                  </div>
                </div>
                <div className={`uac-toggle ${backup ? "is-active" : ""}`}>
                  <div className="toggle-knob"></div>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="step-content final-step">
              <div className="welcome-box">
                <span className="material-symbols-outlined large">
                  auto_awesome
                </span>
                <h3>준비가 완료되었습니다!</h3>
                <p>
                  이제 최적화된 환경에서 Path of Exile & Path of Exile 2를
                  즐기실 수 있습니다.
                </p>
              </div>

              <div className="automation-guide-box">
                <span className="material-symbols-outlined">
                  settings_suggest
                </span>
                <p>
                  추가적인 자동 패치 및 자동 게임 실행 등의 상세 설정은{" "}
                  <strong>[설정 - 자동화]</strong> 메뉴에서 확인하실 수
                  있습니다.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="onboarding-footer">
          {step > 1 && (
            <button className="btn-prev" onClick={handlePrev}>
              이전
            </button>
          )}
          <button
            className="btn-next"
            onClick={step === 4 ? handleFinish : handleNext}
          >
            {step === 4 ? "시작하기" : "다음 단계"}
          </button>
        </div>
      </div>
    </div>
  );
};
