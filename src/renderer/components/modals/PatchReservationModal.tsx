import React, { useState, useEffect, useMemo, useCallback } from "react";

import { PatchReservation, AppConfig } from "../../../shared/types";
import imgGGG from "../../assets/img-ci-ggg_150x67.png";
import imgKakao from "../../assets/img-ci-kakaogames_158x28.png";
import logoPoe1 from "../../assets/poe1/logo.png";
import logoPoe2 from "../../assets/poe2/logo.png";
import { Toast } from "../ui/Toast";
import "./PatchReservationModal.css";

const SERVICE_CONFIG: Record<
  AppConfig["serviceChannel"],
  { logo: string; alt: string }
> = {
  "Kakao Games": { logo: imgKakao, alt: "Kakao Games" },
  GGG: { logo: imgGGG, alt: "GGG" },
};

const GAME_CONFIG: Record<
  AppConfig["activeGame"],
  { logo: string; alt: string }
> = {
  POE1: { logo: logoPoe1, alt: "Path of Exile 1" },
  POE2: { logo: logoPoe2, alt: "Path of Exile 2" },
};

interface TimeSelectProps {
  type: "year" | "month" | "day" | "hour" | "minute";
  value: string;
  options: (string | number)[];
  onChange: (val: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const TimeSelect: React.FC<TimeSelectProps> = ({
  value,
  options,
  onChange,
  isOpen,
  onToggle,
  containerRef,
}) => (
  <div className="time-select-wrapper" ref={containerRef}>
    <div
      className={`time-select-trigger ${isOpen ? "active" : ""}`}
      onClick={onToggle}
    >
      {value}
    </div>
    {isOpen && (
      <div className="time-select-list">
        {options.map((opt) => (
          <div
            key={opt}
            className={`time-select-item ${value === opt.toString() ? "selected" : ""}`}
            onClick={() => {
              onChange(opt.toString());
              onToggle();
            }}
          >
            {opt}
          </div>
        ))}
      </div>
    )}
  </div>
);

interface PatchReservationModalProps {
  isOpen: boolean;
  reservations: PatchReservation[];
  activeGame: AppConfig["activeGame"];
  activeService: AppConfig["serviceChannel"];
  silentNotification: boolean;
  onSilentToggle: (enabled: boolean) => void;
  onAdd: (data: Omit<PatchReservation, "id" | "createdAt">) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onNavigateToSetting?: (configId: string) => void;
  launcherConfig: {
    autoLaunch: boolean;
    closeAction: "minimize" | "close";
    autoFixPatchError: boolean;
    skipDaumGameStarterUac: boolean;
    serviceChannel: AppConfig["serviceChannel"];
  };
}

interface StabilityCheck {
  id: string;
  level: "warning" | "error";
  text: string;
  configId?: string;
  condition: boolean;
}
export const PatchReservationModal: React.FC<PatchReservationModalProps> = ({
  isOpen,
  onClose,
  reservations,
  activeGame,
  activeService,
  silentNotification,
  onSilentToggle,
  onAdd,
  onDelete,
  onNavigateToSetting,
  launcherConfig,
}) => {
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [hour, setHour] = useState("");
  const [minute, setMinute] = useState("");

  const [selectedGame, setSelectedGame] =
    useState<AppConfig["activeGame"]>(activeGame);
  const [selectedService, setSelectedService] =
    useState<AppConfig["serviceChannel"]>(activeService);

  // Real-time time sync
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000 * 30); // Check every 30 seconds for better precision than 60s
    return () => clearInterval(timer);
  }, []);

  // Toast state
  const [toast, setToast] = useState({ visible: false, message: "" });
  const showToast = (message: string) => {
    setToast({ visible: true, message });
    setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 3000);
  };

  const [isServiceOpen, setIsServiceOpen] = useState(false);
  const [isGameOpen, setIsGameOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Local config state for real-time synchronization when modal is open
  const [localConfig, setLocalConfig] = useState(launcherConfig);

  // [Direct Subscription] Listen for config changes while the modal is open
  useEffect(() => {
    if (!isOpen || !window.electronAPI?.onConfigChange) return;

    const removeListener = window.electronAPI.onConfigChange((key, value) => {
      setLocalConfig((prev) => ({
        ...prev,
        [key]: value as AppConfig[keyof AppConfig],
      }));
    });

    return () => removeListener();
  }, [isOpen]);

  // Sync with prop updates if they happen (though direct subscription is primary)
  useEffect(() => {
    if (isOpen) {
      // Use setTimeout to avoid synchronous setState inside effect (cascading render)
      const timer = setTimeout(() => {
        setLocalConfig(launcherConfig);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [launcherConfig, isOpen]);

  const serviceDropdownRef = React.useRef<HTMLDivElement>(null);
  const gameDropdownRef = React.useRef<HTMLDivElement>(null);

  const yearRef = React.useRef<HTMLDivElement>(null);
  const monthRef = React.useRef<HTMLDivElement>(null);
  const dayRef = React.useRef<HTMLDivElement>(null);
  const hourRef = React.useRef<HTMLDivElement>(null);
  const minuteRef = React.useRef<HTMLDivElement>(null);

  const timeRefs = useMemo<
    Record<string, React.RefObject<HTMLDivElement | null>>
  >(
    () => ({
      year: yearRef,
      month: monthRef,
      day: dayRef,
      hour: hourRef,
      minute: minuteRef,
    }),
    [],
  );

  /**
   * Validates and updates the entire time state to ensure it's in the future.
   * This logic is called on every change to prevent cascading renders from useEffect.
   */
  const updateAndValidateTime = useCallback(
    (newValues: {
      y?: string;
      m?: string;
      d?: string;
      h?: string;
      mi?: string;
    }) => {
      const parseVal = (v: string | undefined, fallback: number) => {
        if (v === undefined || v === "") return fallback;
        const parsed = parseInt(v);
        return isNaN(parsed) ? fallback : parsed;
      };

      let ty = parseVal(newValues.y ?? year, currentTime.getFullYear());
      let tm = parseVal(newValues.m ?? month, currentTime.getMonth() + 1);
      let td = parseVal(newValues.d ?? day, currentTime.getDate());
      let th = parseVal(newValues.h ?? hour, currentTime.getHours());
      let tmi = parseVal(newValues.mi ?? minute, currentTime.getMinutes());

      // 1. Month-end adjustment (clamping day)
      const maxDays = new Date(ty, tm, 0).getDate();
      if (td > maxDays) td = maxDays;

      // 2. Future time check & auto-correction (Compare as timestamp)
      const targetDate = new Date(ty, tm - 1, td, th, tmi);
      const minValidDate = currentTime; // Just use currentTime for "isNow" state

      if (targetDate.getTime() < currentTime.getTime()) {
        // Only show toast if it was a manual change or a significant correction
        if (
          newValues.y ||
          newValues.m ||
          newValues.d ||
          newValues.h ||
          newValues.mi
        ) {
          showToast("현재보다 과거로 설정할 수 없습니다.");
        }

        ty = minValidDate.getFullYear();
        tm = minValidDate.getMonth() + 1;
        td = minValidDate.getDate();
        th = minValidDate.getHours();
        tmi = minValidDate.getMinutes();
      }

      setYear(ty.toString());
      setMonth(tm.toString().padStart(2, "0"));
      setDay(td.toString().padStart(2, "0"));
      setHour(th.toString().padStart(2, "0"));
      setMinute(tmi.toString().padStart(2, "0"));
    },
    [year, month, day, hour, minute, currentTime],
  );

  // Time Options Filtering (Disable past times)
  const timeOptions = useMemo(() => {
    const currentYear = currentTime.getFullYear();
    const currentMonth = currentTime.getMonth() + 1;
    const currentDay = currentTime.getDate();
    const currentHour = currentTime.getHours();

    const parseVal = (v: string, fallback: number) => {
      if (!v) return fallback;
      const parsed = parseInt(v);
      return isNaN(parsed) ? fallback : parsed;
    };

    const targetYear = parseVal(year, currentYear);
    const targetMonth = parseVal(month, currentMonth);
    const targetDay = parseVal(day, currentDay);
    const targetHour = parseVal(hour, currentHour);

    const years = [currentYear, currentYear + 1];

    const months = Array.from({ length: 12 }, (_, i) =>
      (i + 1).toString().padStart(2, "0"),
    ).filter((m) => targetYear > currentYear || parseInt(m) >= currentMonth);

    const dInMonth = new Date(targetYear, targetMonth, 0).getDate();
    const days = Array.from({ length: dInMonth }, (_, i) =>
      (i + 1).toString().padStart(2, "0"),
    ).filter(
      (d) =>
        targetYear > currentYear ||
        targetMonth > currentMonth ||
        parseInt(d) >= currentDay,
    );

    const hours = Array.from({ length: 24 }, (_, i) =>
      i.toString().padStart(2, "0"),
    ).filter(
      (h) =>
        targetYear > currentYear ||
        targetMonth > currentMonth ||
        targetDay > currentDay ||
        parseInt(h) >= currentHour,
    );

    const minutes = Array.from({ length: 60 }, (_, i) =>
      i.toString().padStart(2, "0"),
    ).filter(
      (mi) =>
        targetYear > currentYear ||
        targetMonth > currentMonth ||
        targetDay > currentDay ||
        targetHour > currentHour ||
        parseInt(mi) >= currentTime.getMinutes(),
    );

    return { years, months, days, hours, minutes };
  }, [year, month, day, hour, currentTime]);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        serviceDropdownRef.current &&
        !serviceDropdownRef.current.contains(target)
      ) {
        setIsServiceOpen(false);
      }
      if (
        gameDropdownRef.current &&
        !gameDropdownRef.current.contains(target)
      ) {
        setIsGameOpen(false);
      }
      if (openDropdown && !timeRefs[openDropdown]?.current?.contains(target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openDropdown, timeRefs]);

  // Reset inputs when modal opens
  const lastOpenRef = React.useRef(false);
  useEffect(() => {
    if (isOpen && !lastOpenRef.current) {
      setTimeout(() => {
        setSelectedGame(activeGame);
        setSelectedService(activeService);

        const initialDate = currentTime; // Default to just "now"

        setYear(initialDate.getFullYear().toString());
        setMonth((initialDate.getMonth() + 1).toString().padStart(2, "0"));
        setDay(initialDate.getDate().toString().padStart(2, "0"));
        setHour(initialDate.getHours().toString().padStart(2, "0"));
        setMinute(initialDate.getMinutes().toString().padStart(2, "0"));
      }, 0);
    }
    lastOpenRef.current = isOpen;
  }, [isOpen, activeGame, activeService, currentTime]);

  // Reactive auto-correction: if time passes and selected becomes past, correct it.
  useEffect(() => {
    if (!isOpen) return;

    const targetDate = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
    );

    if (targetDate.getTime() < currentTime.getTime()) {
      // Use setTimeout to avoid synchronous setState inside useEffect
      setTimeout(() => {
        if (isOpen) {
          updateAndValidateTime({});
        }
      }, 0);
    }
  }, [
    currentTime,
    isOpen,
    year,
    month,
    day,
    hour,
    minute,
    updateAndValidateTime,
  ]);

  const isNow = useMemo(() => {
    return (
      year === currentTime.getFullYear().toString() &&
      month === (currentTime.getMonth() + 1).toString().padStart(2, "0") &&
      day === currentTime.getDate().toString().padStart(2, "0") &&
      hour === currentTime.getHours().toString().padStart(2, "0") &&
      minute === currentTime.getMinutes().toString().padStart(2, "0")
    );
  }, [year, month, day, hour, minute, currentTime]);

  // Stability Checks Logic
  const stabilityChecks = useMemo<StabilityCheck[]>(() => {
    // 1. Identify all services involved (current selection + existing reservations)
    const activeServices = new Set<string>();
    activeServices.add(selectedService);
    reservations.forEach((r) => activeServices.add(r.serviceId));

    // 2. Determine if Kakao-specific checks are needed
    const needsKakaoChecks = activeServices.has("Kakao Games");

    const checks: StabilityCheck[] = [
      {
        id: "auto-launch",
        level: "warning",
        text: "컴퓨터 시작 시 자동 실행이 꺼져 있습니다. (런처가 꺼져 있으면 예약 패치가 동작하지 않습니다.)",
        configId: "autoLaunch",
        condition: !localConfig.autoLaunch,
      },
      {
        id: "close-action",
        level: "warning",
        text: "창 닫기 설정이 '종료'로 되어 있습니다. (트레이 최소화 권장)",
        configId: "closeAction",
        condition: localConfig.closeAction === "close",
      },
      {
        id: "kakao-uac",
        level: "error",
        text: "카카오 플랫폼은 UAC 우회 설정이 꺼져 있으면 자동 패치가 불가능합니다.",
        configId: "skipDaumGameStarterUac",
        condition: needsKakaoChecks && !localConfig.skipDaumGameStarterUac,
      },
      {
        id: "auto-fix",
        level: "warning",
        text: "패치 오류 자동 수정이 꺼져 있습니다. (오류 발생 시 패치가 중단됩니다.)",
        configId: "autoFixPatchError",
        condition: !localConfig.autoFixPatchError,
      },
    ];

    return checks
      .filter((c) => c.condition)
      .sort((a, b) => {
        if (a.level === "error" && b.level !== "error") return -1;
        if (a.level !== "error" && b.level === "error") return 1;
        return 0;
      });
  }, [localConfig, selectedService, reservations]);

  const hasError = useMemo(
    () => stabilityChecks.some((c) => c.level === "error"),
    [stabilityChecks],
  );

  if (!isOpen) return null;

  const handleAdd = () => {
    if (hasError) {
      showToast(
        "현재 설정으로는 예약 패치가 불가능합니다. '확인 필요' 항목을 해결해주세요.",
      );
      return;
    }

    if (isNow) {
      showToast(
        "현재 시간으로는 예약할 수 없습니다. 시간을 다시 설정해주세요.",
      );
      return;
    }

    const targetDate = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
    );

    if (isNaN(targetDate.getTime())) return;

    onAdd({
      gameId: selectedGame,
      serviceId: selectedService,
      targetTime: targetDate.toISOString(),
    });
    showToast("새로운 패치 예약이 추가되었습니다.");
  };

  const isFormValid = year && month && day && hour && minute;

  return (
    <div
      className="patch-reservation-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="patch-reservation-modal-content">
        <div className="patch-header">
          <span className="material-symbols-outlined icon">schedule</span>
          <div className="header-text">
            <h2>게임 패치 예약 설정</h2>
            <div className="header-sub-text">
              원하는 시간에 게임 패치를 자동으로 시작합니다.
              <br />
              <span className="warning-text">
                ※ 예약 실행 시간에 게임이 이미 켜져 있으면 정상적으로 동작하지
                않습니다.
              </span>
            </div>
          </div>
          <button className="btn-close-icon" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="patch-body">
          {/* Section 1: Add Reservation */}
          <div className="section-header">
            <span className="title">새로운 예약 추가</span>
          </div>
          <div className="reservation-form">
            <div className="form-group-row">
              <div className="form-group" ref={serviceDropdownRef}>
                <label>서비스</label>
                <div className="custom-dropdown-wrapper">
                  <div
                    className={`custom-dropdown-trigger ${isServiceOpen ? "active" : ""}`}
                    onClick={() => setIsServiceOpen(!isServiceOpen)}
                  >
                    <img
                      src={SERVICE_CONFIG[selectedService].logo}
                      alt={SERVICE_CONFIG[selectedService].alt}
                      className="dropdown-logo"
                    />
                  </div>
                  {isServiceOpen && (
                    <div className="custom-dropdown-list">
                      {(
                        Object.keys(
                          SERVICE_CONFIG,
                        ) as AppConfig["serviceChannel"][]
                      ).map((key) => (
                        <div
                          key={key}
                          className={`custom-dropdown-item ${selectedService === key ? "selected" : ""}`}
                          onClick={() => {
                            setSelectedService(key);
                            setIsServiceOpen(false);
                          }}
                        >
                          <img
                            src={SERVICE_CONFIG[key].logo}
                            alt={SERVICE_CONFIG[key].alt}
                            className="dropdown-logo"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="form-group" ref={gameDropdownRef}>
                <label>게임</label>
                <div className="custom-dropdown-wrapper">
                  <div
                    className={`custom-dropdown-trigger ${isGameOpen ? "active" : ""}`}
                    onClick={() => setIsGameOpen(!isGameOpen)}
                  >
                    <span className="selected-text">
                      {GAME_CONFIG[selectedGame].alt}
                    </span>
                  </div>
                  {isGameOpen && (
                    <div className="custom-dropdown-list">
                      {(
                        Object.keys(GAME_CONFIG) as AppConfig["activeGame"][]
                      ).map((key) => (
                        <div
                          key={key}
                          className={`custom-dropdown-item ${selectedGame === key ? "selected" : ""}`}
                          onClick={() => {
                            setSelectedGame(key);
                            setIsGameOpen(false);
                          }}
                        >
                          <span className="item-text">
                            {GAME_CONFIG[key].alt}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>예약 시간</label>
              <div className="form-group-time-grid">
                <div
                  className={`time-select-outer year ${isNow ? "is-now" : ""}`}
                >
                  <label>YYYY</label>
                  <TimeSelect
                    type="year"
                    value={year}
                    options={timeOptions.years}
                    onChange={(val) => updateAndValidateTime({ y: val })}
                    isOpen={openDropdown === "year"}
                    onToggle={() =>
                      setOpenDropdown(openDropdown === "year" ? null : "year")
                    }
                    containerRef={yearRef}
                  />
                </div>
                <div className="time-separator">/</div>
                <div className={`time-select-outer ${isNow ? "is-now" : ""}`}>
                  <label>MM</label>
                  <TimeSelect
                    type="month"
                    value={month}
                    options={timeOptions.months}
                    onChange={(val) => updateAndValidateTime({ m: val })}
                    isOpen={openDropdown === "month"}
                    onToggle={() =>
                      setOpenDropdown(openDropdown === "month" ? null : "month")
                    }
                    containerRef={monthRef}
                  />
                </div>
                <div className="time-separator">/</div>
                <div className={`time-select-outer ${isNow ? "is-now" : ""}`}>
                  <label>DD</label>
                  <TimeSelect
                    type="day"
                    value={day}
                    options={timeOptions.days}
                    onChange={(val) => updateAndValidateTime({ d: val })}
                    isOpen={openDropdown === "day"}
                    onToggle={() =>
                      setOpenDropdown(openDropdown === "day" ? null : "day")
                    }
                    containerRef={dayRef}
                  />
                </div>
                <div
                  className="time-separator"
                  style={{ margin: "14px 8px 0" }}
                >
                  |
                </div>
                <div className={`time-select-outer ${isNow ? "is-now" : ""}`}>
                  <label>HH</label>
                  <TimeSelect
                    type="hour"
                    value={hour}
                    options={timeOptions.hours}
                    onChange={(val) => updateAndValidateTime({ h: val })}
                    isOpen={openDropdown === "hour"}
                    onToggle={() =>
                      setOpenDropdown(openDropdown === "hour" ? null : "hour")
                    }
                    containerRef={hourRef}
                  />
                </div>
                <div className="time-separator">:</div>
                <div className={`time-select-outer ${isNow ? "is-now" : ""}`}>
                  <label>mm</label>
                  <TimeSelect
                    type="minute"
                    value={minute}
                    options={timeOptions.minutes}
                    onChange={(val) => updateAndValidateTime({ mi: val })}
                    isOpen={openDropdown === "minute"}
                    onToggle={() =>
                      setOpenDropdown(
                        openDropdown === "minute" ? null : "minute",
                      )
                    }
                    containerRef={minuteRef}
                  />
                </div>
              </div>
            </div>

            <button
              className={`btn-add-reservation ${hasError || isNow ? "has-error" : ""}`}
              onClick={handleAdd}
              disabled={!isFormValid}
            >
              <span className="material-symbols-outlined">add</span>
              예약 추가하기
            </button>
          </div>

          {/* Section 2: Action Required */}
          {stabilityChecks.length > 0 && (
            <div className="stability-section">
              <div className="section-header">
                <span className="title">확인 필요</span>
                <span className="count warning">
                  {stabilityChecks.length}건
                </span>
              </div>
              <div className="stability-list">
                {stabilityChecks.map((check) => (
                  <div
                    key={check.id}
                    className={`stability-item level-${check.level}`}
                  >
                    <div className="item-content">
                      <span className="material-symbols-outlined icon">
                        {check.level === "error" ? "report" : "warning"}
                      </span>
                      <span className="text">{check.text}</span>
                    </div>
                    {check.configId && (
                      <button
                        className="btn-go-setting"
                        onClick={() => onNavigateToSetting?.(check.configId!)}
                        title="설정으로 이동"
                      >
                        <span className="material-symbols-outlined">
                          settings
                        </span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 3: Current Reservations */}
          <div className="reservation-list-section">
            <div className="section-header">
              <span className="title">현재 예약 목록</span>
              <span className="count">{reservations.length}개</span>
            </div>

            <div className="reservation-list">
              {reservations.length === 0 ? (
                <div className="empty-list">예약된 항목이 없습니다.</div>
              ) : (
                reservations
                  .sort(
                    (a, b) =>
                      new Date(a.targetTime).getTime() -
                      new Date(b.targetTime).getTime(),
                  )
                  .map((res) => (
                    <div key={res.id} className="reservation-item">
                      <div className="res-info">
                        <div className="res-game-service">
                          <span
                            className={`badge ${res.serviceId.replace(" ", "-").toLowerCase()}`}
                          >
                            {res.serviceId}
                          </span>
                          <span className="game-name">{res.gameId}</span>
                        </div>
                        <div className="res-time">
                          {new Date(res.targetTime).toLocaleString("ko-KR", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </div>
                      </div>
                      <button
                        className="btn-delete"
                        onClick={() => onDelete(res.id)}
                      >
                        <span className="material-symbols-outlined">
                          delete
                        </span>
                      </button>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>

        <div className="patch-actions">
          <button
            className={`btn-silent-toggle ${!silentNotification ? "notif-enabled" : "is-silent"}`}
            onClick={() => {
              const newState = !silentNotification;
              onSilentToggle(newState);
              showToast(
                newState
                  ? "패치 완료 알림을 표시하지 않습니다. (방해 금지 모드)"
                  : "패치 완료 후 결과를 알림으로 표시합니다.",
              );
            }}
            title={
              silentNotification
                ? "알림 켜기 (현재 방해 금지)"
                : "알림 끄기 (방해 금지)"
            }
          >
            <span className="material-symbols-outlined">
              {silentNotification
                ? "notifications_off"
                : "notifications_active"}
            </span>
          </button>
          <div className="spacer" />
          <button className="btn-confirm" onClick={onClose}>
            닫기
          </button>
        </div>
        <Toast
          message={toast.message}
          visible={toast.visible}
          container={null}
          variant="warning"
        />
      </div>
    </div>
  );
};
