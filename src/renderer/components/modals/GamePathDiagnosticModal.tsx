import React from "react";

import "./GamePathDiagnosticModal.css";
import {
  ACTIVE_GAMES,
  SERVICE_CHANNELS,
  type ActiveGame,
  type GameInstallPathConfigDiagnostic,
  type GameInstallPathDiagnostics,
  type GameInstallPathRegistryCandidateDiagnostic,
  type GameInstallPathRegistryDiagnostic,
  type ServiceChannel,
} from "../../../shared/types";
import { getRegistryRegistrationEligibility } from "../../utils/game-path-registry-registration";
import { SERVICE_CHANNEL_ASSETS } from "../../utils/service-channel-assets";
import { Toast } from "../ui/Toast";

type GamePathSource = "config" | "registry";
type GamePathModalMode = "conflict" | "missing" | "diagnostic";
type PathDiagnostic =
  GameInstallPathConfigDiagnostic | GameInstallPathRegistryDiagnostic;
type PathStatusDiagnostic = Pick<PathDiagnostic, "state" | "verification">;

interface GamePathDiagnosticModalProps {
  isOpen: boolean;
  mode: GamePathModalMode;
  serviceId: ServiceChannel;
  gameId: ActiveGame;
  diagnostics: GameInstallPathDiagnostics | null;
  busy?: boolean;
  errorMessage?: string;
  highlightManual?: boolean;
  showRegistrySyncConfirm?: boolean;
  showRegistryClearConfirm?: boolean;
  showRegistryRegisterConfirm?: boolean;
  manualSaveToastId?: number;
  registrySaveToastId?: number;
  onClose: () => void;
  onContextChange: (serviceId: ServiceChannel, gameId: ActiveGame) => void;
  onUsePath: (source: GamePathSource) => void;
  onClearPath: (source: GamePathSource) => void;
  onManualSelect: () => void;
  onRegistrySyncConfirmClose: () => void;
  onRegistryClearConfirmClose: () => void;
  onRegistryRegisterRequest: () => void;
  onRegistryRegisterConfirmClose: () => void;
  onKeepLauncherConfig: () => void;
  onSyncRegistry: () => void;
  onConfirmClearRegistry: () => void;
  onConfirmRegisterRegistry: () => void;
  onInstall?: () => void;
}

const getStatusIcon = (diagnostic: PathStatusDiagnostic) => {
  if (diagnostic.verification === "valid") return "check_circle";
  if (diagnostic.verification === "missing") return "cancel";
  if (
    diagnostic.verification === "unknown" ||
    diagnostic.state === "context-unavailable" ||
    diagnostic.state === "read-failed"
  ) {
    return "warning";
  }
  return "help";
};

const getStatusClass = (diagnostic: PathStatusDiagnostic) => {
  if (diagnostic.verification === "valid") return "is-valid";
  if (diagnostic.verification === "missing") return "is-invalid";
  if (
    diagnostic.verification === "unknown" ||
    diagnostic.state === "context-unavailable" ||
    diagnostic.state === "read-failed"
  ) {
    return "is-unknown";
  }
  return "is-empty";
};

const getStatusText = (diagnostic: PathStatusDiagnostic) => {
  if (diagnostic.verification === "valid") return "확인됨";
  if (diagnostic.verification === "missing") return "실행 파일 없음";
  if (diagnostic.verification === "unknown") return "확인 불가";

  switch (diagnostic.state) {
    case "empty":
      return "미설정";
    case "context-unavailable":
      return "설정 확인 불가";
    case "key-missing":
      return "레지스트리 키 없음";
    case "value-missing":
      return "경로값 없음";
    case "value-empty":
      return "경로값 비어 있음";
    case "read-failed":
      return "레지스트리 확인 실패";
    default:
      return "확인 전";
  }
};

const getEmptyPathText = (source: GamePathSource) => {
  return source === "registry" ? "레지스트리 경로 없음" : "저장된 경로 없음";
};

const getActionText = (source: GamePathSource) => {
  return source === "registry" ? "이 경로 사용" : "설정 경로 유지";
};

const getClearActionText = (source: GamePathSource) => {
  return source === "registry" ? "레지스트리 값 삭제" : "저장된 경로 삭제";
};

const GAME_LABELS: Record<ActiveGame, string> = {
  POE1: "POE1",
  POE2: "POE2",
};

const getRegistryCandidateLabel = (
  serviceId: ServiceChannel,
  index: number,
) => {
  if (serviceId !== "Kakao Games") return `후보 ${index + 1}`;
  return index === 0 ? "Kakaogames (기본)" : "DaumGames (호환)";
};

const getRegistryCandidateStatusText = (
  candidate: GameInstallPathRegistryCandidateDiagnostic,
  index: number,
) => {
  if (candidate.isActive) {
    return index === 0 ? "기본 경로 사용 중" : "호환 경로 사용 중 (fallback)";
  }
  if (candidate.verification === "valid") return "사용 가능";
  return getStatusText(candidate);
};

const RegistryCandidateList: React.FC<{
  serviceId: ServiceChannel;
  candidates: GameInstallPathRegistryCandidateDiagnostic[];
}> = ({ serviceId, candidates }) => (
  <div className="game-path-registry-candidates">
    {candidates.map((candidate, index) => {
      const statusClass = getStatusClass(candidate);
      return (
        <div
          key={`${candidate.registryPath}:${candidate.registryValueName}`}
          className={`game-path-registry-candidate ${statusClass} ${
            candidate.isActive ? "is-active" : ""
          }`}
        >
          <div className="game-path-registry-candidate-head">
            <strong>{getRegistryCandidateLabel(serviceId, index)}</strong>
            <span className={statusClass}>
              {getRegistryCandidateStatusText(candidate, index)}
            </span>
          </div>
          <div className="game-path-option-meta">
            <div>키: {candidate.registryPath}</div>
            <div>값 이름: {candidate.registryValueName}</div>
          </div>
          <div
            className={`game-path-registry-candidate-path ${
              candidate.path ? "" : "is-empty"
            }`}
          >
            {candidate.path || "등록된 경로 없음"}
          </div>
        </div>
      );
    })}
  </div>
);

const GamePathServiceSelect: React.FC<{
  value: ServiceChannel;
  disabled: boolean;
  onChange: (value: ServiceChannel) => void;
}> = ({ value, disabled, onChange }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const selectRef = React.useRef<HTMLDivElement>(null);
  const activeInfo = SERVICE_CHANNEL_ASSETS[value];

  React.useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!selectRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }

    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  return (
    <div
      className="game-path-context-select game-path-service-select"
      ref={selectRef}
    >
      <button
        type="button"
        className={`game-path-context-trigger ${isOpen ? "is-open" : ""}`}
        disabled={disabled}
        aria-label="서비스 선택"
        onClick={() => setIsOpen((current) => !current)}
      >
        <img
          src={activeInfo.logo}
          alt={activeInfo.alt}
          className="game-path-channel-logo"
        />
        <span className="material-symbols-outlined">expand_more</span>
      </button>

      {isOpen && (
        <div className="game-path-context-menu">
          {SERVICE_CHANNELS.map((service) => {
            const info = SERVICE_CHANNEL_ASSETS[service];

            return (
              <button
                key={service}
                type="button"
                className={`game-path-context-item ${
                  value === service ? "is-selected" : ""
                }`}
                onClick={() => {
                  onChange(service);
                  setIsOpen(false);
                }}
              >
                <img
                  src={info.logo}
                  alt={info.alt}
                  className="game-path-channel-logo"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const GamePathGameSelect: React.FC<{
  value: ActiveGame;
  disabled: boolean;
  onChange: (value: ActiveGame) => void;
}> = ({ value, disabled, onChange }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const selectRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!selectRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }

    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  return (
    <div
      className="game-path-context-select game-path-game-select"
      ref={selectRef}
    >
      <button
        type="button"
        className={`game-path-context-trigger ${isOpen ? "is-open" : ""}`}
        disabled={disabled}
        aria-label="게임 선택"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="game-path-game-label">{GAME_LABELS[value]}</span>
        <span className="material-symbols-outlined">expand_more</span>
      </button>

      {isOpen && (
        <div className="game-path-context-menu">
          {ACTIVE_GAMES.map((game) => (
            <button
              key={game}
              type="button"
              className={`game-path-context-item ${
                value === game ? "is-selected" : ""
              }`}
              onClick={() => {
                onChange(game);
                setIsOpen(false);
              }}
            >
              <span className="game-path-game-label">{GAME_LABELS[game]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const PathOptionCard: React.FC<{
  title: string;
  source: GamePathSource;
  diagnostic: PathDiagnostic;
  serviceId?: ServiceChannel;
  recommended: boolean;
  busy: boolean;
  onUsePath: (source: GamePathSource) => void;
  onClearPath: (source: GamePathSource) => void;
  onManualSelect: () => void;
}> = ({
  title,
  source,
  diagnostic,
  serviceId,
  recommended,
  busy,
  onUsePath,
  onClearPath,
  onManualSelect,
}) => {
  const canUsePath = Boolean(
    diagnostic.path && diagnostic.verification === "valid",
  );
  const canClearPath = Boolean(diagnostic.path);
  const canReselectConfigPath = Boolean(
    source === "config" &&
    diagnostic.path &&
    diagnostic.verification === "missing",
  );
  const statusClass = getStatusClass(diagnostic);
  const actionDisabled = (!canUsePath && !canReselectConfigPath) || busy;

  return (
    <section
      className={`game-path-option ${statusClass} ${
        recommended ? "is-recommended" : ""
      }`}
    >
      <div className="game-path-option-head">
        <div>
          <div className="game-path-option-title">{title}</div>
          {diagnostic.source === "registry" && (
            <div className="game-path-option-meta">
              <div>키: {diagnostic.registryPath}</div>
              <div>값 이름: {diagnostic.registryValueName}</div>
            </div>
          )}
        </div>
        <div className={`game-path-state ${statusClass}`}>
          <span className="material-symbols-outlined">
            {getStatusIcon(diagnostic)}
          </span>
          {getStatusText(diagnostic)}
        </div>
      </div>

      <div
        className={`game-path-option-path ${diagnostic.path ? "" : "is-empty"}`}
        title={diagnostic.path || getEmptyPathText(source)}
      >
        {diagnostic.path || getEmptyPathText(source)}
      </div>

      {diagnostic.error && (
        <div className="game-path-option-error">{diagnostic.error}</div>
      )}

      {diagnostic.source === "registry" && serviceId && (
        <RegistryCandidateList
          serviceId={serviceId}
          candidates={diagnostic.candidates}
        />
      )}

      <div className="game-path-option-actions">
        <button
          type="button"
          className={`game-path-action ${
            recommended ? "primary" : "secondary"
          } ${canReselectConfigPath ? "reselect" : ""}`}
          disabled={actionDisabled}
          onClick={() =>
            canReselectConfigPath ? onManualSelect() : onUsePath(source)
          }
        >
          <span className="material-symbols-outlined">
            {canReselectConfigPath
              ? "folder_open"
              : source === "registry"
                ? "sync_alt"
                : "check"}
          </span>
          {canReselectConfigPath ? "다시 선택" : getActionText(source)}
        </button>

        {canClearPath && (
          <button
            type="button"
            className={`game-path-action path-clear ${
              source === "registry" ? "danger" : "secondary"
            }`}
            disabled={busy}
            onClick={() => onClearPath(source)}
          >
            <span className="material-symbols-outlined">delete</span>
            {getClearActionText(source)}
          </button>
        )}
      </div>
    </section>
  );
};

const GamePathDiagnosticModal: React.FC<GamePathDiagnosticModalProps> = ({
  isOpen,
  mode,
  serviceId,
  gameId,
  diagnostics,
  busy = false,
  errorMessage,
  highlightManual = false,
  showRegistrySyncConfirm = false,
  showRegistryClearConfirm = false,
  showRegistryRegisterConfirm = false,
  manualSaveToastId,
  registrySaveToastId,
  onClose,
  onContextChange,
  onUsePath,
  onClearPath,
  onManualSelect,
  onRegistrySyncConfirmClose,
  onRegistryClearConfirmClose,
  onRegistryRegisterRequest,
  onRegistryRegisterConfirmClose,
  onKeepLauncherConfig,
  onSyncRegistry,
  onConfirmClearRegistry,
  onConfirmRegisterRegistry,
  onInstall,
}) => {
  const manualRowRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen || !diagnostics || !highlightManual) return;

    const timer = window.setTimeout(() => {
      manualRowRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [diagnostics, highlightManual, isOpen]);

  const subtitle =
    mode === "missing"
      ? "설치된 게임 경로를 찾지 못했습니다."
      : mode === "conflict"
        ? "설정 경로와 레지스트리 경로가 다릅니다."
        : "서비스와 게임별 설치 경로를 확인합니다.";
  const registrationEligibility = diagnostics
    ? getRegistryRegistrationEligibility(diagnostics)
    : "not-applicable";
  const canonicalCandidate = diagnostics?.registry.candidates[0];

  if (!isOpen) return null;

  return (
    <div
      className="game-path-modal-overlay"
      aria-busy={busy}
      onClick={busy ? undefined : onClose}
    >
      <div
        className="game-path-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="game-path-modal-header">
          <div className="game-path-title-group">
            <h2 className="game-path-title">게임 경로 진단</h2>
            <p className="game-path-subtitle">{subtitle}</p>
          </div>
          <div className="game-path-context-controls">
            <GamePathServiceSelect
              value={serviceId}
              disabled={busy}
              onChange={(nextServiceId) =>
                onContextChange(nextServiceId, gameId)
              }
            />
            <GamePathGameSelect
              value={gameId}
              disabled={busy}
              onChange={(nextGameId) => onContextChange(serviceId, nextGameId)}
            />
          </div>
        </header>

        <div className="game-path-modal-body">
          {!diagnostics ? (
            <div className="game-path-loading">
              <span className="material-symbols-outlined">sync</span>
              경로를 확인하는 중...
            </div>
          ) : (
            <>
              <div className="game-path-options">
                <PathOptionCard
                  title="레지스트리"
                  source="registry"
                  diagnostic={diagnostics.registry}
                  serviceId={serviceId}
                  recommended={diagnostics.recommendedSource === "registry"}
                  busy={busy}
                  onUsePath={onUsePath}
                  onClearPath={onClearPath}
                  onManualSelect={onManualSelect}
                />
                <PathOptionCard
                  title="런처 내 설정"
                  source="config"
                  diagnostic={diagnostics.config}
                  recommended={diagnostics.recommendedSource === "config"}
                  busy={busy}
                  onUsePath={onUsePath}
                  onClearPath={onClearPath}
                  onManualSelect={onManualSelect}
                />
              </div>

              {(registrationEligibility === "eligible" ||
                registrationEligibility === "unknown" ||
                registrationEligibility === "blocked") && (
                <div className="game-path-registry-register-row">
                  <div>
                    <strong>카카오게임즈 레지스트리 복구</strong>
                    <span>
                      {registrationEligibility === "eligible"
                        ? "런처 내 설정 경로를 Kakaogames 기본 키에 등록할 수 있습니다."
                        : registrationEligibility === "unknown"
                          ? "레지스트리 상태를 확인할 수 없어 안전하게 등록할 수 없습니다. 다시 진단해 주세요."
                          : "기존 레지스트리 경로값이 있어 새 경로를 등록할 수 없습니다."}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="game-path-action secondary"
                    disabled={busy || registrationEligibility !== "eligible"}
                    onClick={onRegistryRegisterRequest}
                  >
                    <span className="material-symbols-outlined">add_link</span>
                    레지스트리에 경로 등록
                  </button>
                </div>
              )}

              <div
                ref={manualRowRef}
                className={`game-path-manual-row ${
                  highlightManual ? "is-highlighted" : ""
                }`}
              >
                <div>
                  <strong>수동 설정</strong>
                  <span>
                    선택한 폴더 안에 {diagnostics.executableName}가 있어야
                    합니다.
                  </span>
                </div>
                <button
                  type="button"
                  className="game-path-action secondary"
                  disabled={busy}
                  onClick={onManualSelect}
                >
                  <span className="material-symbols-outlined">folder_open</span>
                  폴더 선택
                </button>
              </div>
            </>
          )}

          {errorMessage && (
            <div className="game-path-error-banner">
              <span className="material-symbols-outlined">error</span>
              {errorMessage}
            </div>
          )}
        </div>

        <footer className="game-path-modal-footer">
          <button
            type="button"
            className="game-path-action ghost"
            disabled={busy}
            onClick={onClose}
          >
            닫기
          </button>
          {onInstall && (
            <button
              type="button"
              className="game-path-action primary"
              disabled={busy}
              onClick={onInstall}
            >
              <span className="material-symbols-outlined">download</span>
              설치하기
            </button>
          )}
        </footer>

        {showRegistrySyncConfirm &&
          diagnostics?.config.path &&
          diagnostics?.registry.path && (
            <div className="game-path-confirm-overlay">
              <div
                className="game-path-confirm-dialog"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="game-path-confirm-icon">
                  <span className="material-symbols-outlined">warning</span>
                </div>
                <div className="game-path-confirm-content">
                  <h3>레지스트리 설치 경로를 변경할까요?</h3>
                  <p>
                    레지스트리는 게임이 설치될 때 게임 쪽에서 자동으로 추가하는
                    값입니다. 현재 값이 왜 손상되었거나 달라졌는지는 런처에서 알
                    수 없습니다.
                  </p>
                  <p>
                    이 값은 런처 외부의 게임 실행/패치 프로그램에서도 사용될 수
                    있습니다. 잘못된 경로로 변경하면 일반적인 실행 환경에서도
                    게임을 찾지 못할 수 있습니다.
                  </p>
                  <div className="game-path-confirm-paths">
                    <div>
                      <span>변경 전</span>
                      <strong>{diagnostics.registry.path}</strong>
                    </div>
                    <div>
                      <span>변경 후</span>
                      <strong>{diagnostics.config.path}</strong>
                    </div>
                  </div>
                </div>
                <div className="game-path-confirm-actions">
                  <button
                    type="button"
                    className="game-path-action ghost"
                    disabled={busy}
                    onClick={onRegistrySyncConfirmClose}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="game-path-action secondary"
                    disabled={busy}
                    onClick={onKeepLauncherConfig}
                  >
                    런처 내 설정만 사용
                  </button>
                  <button
                    type="button"
                    className="game-path-action danger"
                    disabled={busy}
                    onClick={onSyncRegistry}
                  >
                    <span className="material-symbols-outlined">warning</span>
                    레지스트리에 반영
                  </button>
                </div>
              </div>
            </div>
          )}

        {showRegistryRegisterConfirm &&
          registrationEligibility === "eligible" &&
          diagnostics?.config.path &&
          canonicalCandidate && (
            <div className="game-path-confirm-overlay">
              <div
                className="game-path-confirm-dialog"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="game-path-confirm-icon">
                  <span className="material-symbols-outlined">add_link</span>
                </div>
                <div className="game-path-confirm-content">
                  <h3>레지스트리에 게임 경로를 등록할까요?</h3>
                  <p>
                    런처 내 설정 경로를 카카오게임즈 기본 레지스트리 값으로
                    등록합니다. 확인하는 동안 기존 값이 생기거나 상태를 읽을 수
                    없으면 변경하지 않습니다.
                  </p>
                  <p>DaumGames (호환) 키와 값은 변경하지 않습니다.</p>
                  <div className="game-path-confirm-paths">
                    <div>
                      <span>키</span>
                      <strong>{canonicalCandidate.registryPath}</strong>
                    </div>
                    <div>
                      <span>값 이름</span>
                      <strong>{canonicalCandidate.registryValueName}</strong>
                    </div>
                    <div>
                      <span>등록 경로</span>
                      <strong>{diagnostics.config.path}</strong>
                    </div>
                  </div>
                </div>
                <div className="game-path-confirm-actions">
                  <button
                    type="button"
                    className="game-path-action ghost"
                    disabled={busy}
                    onClick={onRegistryRegisterConfirmClose}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="game-path-action primary"
                    disabled={busy}
                    onClick={onConfirmRegisterRegistry}
                  >
                    <span className="material-symbols-outlined">add_link</span>
                    경로 등록
                  </button>
                </div>
              </div>
            </div>
          )}

        {showRegistryClearConfirm && diagnostics?.registry.path && (
          <div className="game-path-confirm-overlay">
            <div
              className="game-path-confirm-dialog is-danger"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="game-path-confirm-icon">
                <span className="material-symbols-outlined">warning</span>
              </div>
              <div className="game-path-confirm-content">
                <h3>레지스트리 설치 경로를 삭제할까요?</h3>
                <p>
                  레지스트리는 게임이 설치될 때 게임 쪽에서 자동으로 추가하는
                  값입니다. 현재 값이 왜 손상되었거나 달라졌는지는 런처에서 알
                  수 없습니다.
                </p>
                <p>
                  삭제하면 런처 외부의 게임 실행/패치 프로그램에서 게임 경로를
                  찾지 못할 수 있습니다.
                </p>
                <div className="game-path-confirm-paths">
                  <div>
                    <span>삭제 대상</span>
                    <strong>{diagnostics.registry.path}</strong>
                  </div>
                </div>
              </div>
              <div className="game-path-confirm-actions">
                <button
                  type="button"
                  className="game-path-action ghost"
                  disabled={busy}
                  onClick={onRegistryClearConfirmClose}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="game-path-action danger"
                  disabled={busy}
                  onClick={onConfirmClearRegistry}
                >
                  <span className="material-symbols-outlined">delete</span>
                  레지스트리 값 삭제
                </button>
              </div>
            </div>
          </div>
        )}

        {manualSaveToastId && (
          <Toast
            key={manualSaveToastId}
            message="게임 경로가 저장되었습니다."
            visible
            variant="success"
          />
        )}
        {registrySaveToastId && (
          <Toast
            key={registrySaveToastId}
            message="레지스트리 게임 경로가 등록되었습니다."
            visible
            variant="success"
          />
        )}
      </div>
    </div>
  );
};

export default GamePathDiagnosticModal;
