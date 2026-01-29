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

  useEffect(() => {
    if (isOpen && window.electronAPI) {
      window.electronAPI.isUACBypassEnabled().then(setUacBypass);
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

  const handleFinish = () => {
    onFinish();
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
                  : "rocket_launch"}
            </span>
          </div>
          <div className="header-text">
            <h2>
              {step === 1
                ? "런처 시작 안내 및 고지"
                : step === 2
                  ? "DaumGameStarter 권한 설정"
                  : "설정 완료"}
            </h2>
            <div className="step-indicator">단계 {step} / 3</div>
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
            onClick={step === 3 ? handleFinish : handleNext}
          >
            {step === 3 ? "시작하기" : "다음 단계"}
          </button>
        </div>
      </div>
    </div>
  );
};
