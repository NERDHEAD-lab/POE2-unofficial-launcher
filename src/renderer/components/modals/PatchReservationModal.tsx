import React, { useState, useEffect, useMemo, useCallback } from "react";

import {
  calculateRangeCheckCount,
  parseLocalTime,
} from "../../../shared/patch-reservation";
import imgGGG from "../../assets/img-ci-ggg_150x67.png";
import imgKakao from "../../assets/img-ci-kakaogames_158x28.png";
import logoPoe1 from "../../assets/poe1/logo.png";
import logoPoe2 from "../../assets/poe2/logo.png";
import { Toast } from "../ui/Toast";
import "./PatchReservationModal.css";

import type {
  AppConfig,
  PatchReservation,
  RenewedPatchReservation,
  RenewedPatchReservationCommandResult,
  RenewedPatchReservationInput,
} from "../../../shared/types";

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

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const RANGE_CHECK_WARNING =
  "지정한 시간 범위에서 확인 요청이 180회를 초과합니다. 반복 확인이 패치 서버에 미치는 영향이 명확하지 않으므로, 확인 간격을 늘리거나 시간 범위를 줄이는 것을 권장합니다.";

const padTimePart = (value: number) => value.toString().padStart(2, "0");

const toLocalMinuteDateTimeInput = (date: Date) =>
  `${date.getFullYear()}-${padTimePart(date.getMonth() + 1)}-${padTimePart(date.getDate())}T${padTimePart(date.getHours())}:${padTimePart(date.getMinutes())}:00`;

const toLocalMinuteTimeInput = (date: Date) =>
  `${padTimePart(date.getHours())}:${padTimePart(date.getMinutes())}:00`;

const toCurrentLocalMinuteInput = () => toLocalMinuteDateTimeInput(new Date());

const addHoursToLocalDateTimeInput = (value: string, hours: number) => {
  const start = Date.parse(value);
  if (!Number.isFinite(start) || !Number.isInteger(hours) || hours < 1) {
    return "";
  }

  const end = start + hours * 60 * 60_000;
  return Number.isFinite(end) ? toLocalMinuteDateTimeInput(new Date(end)) : "";
};

const clampLocalDateTimeInput = (value: string, min?: string) => {
  if (!min) return value;
  const valueTime = Date.parse(value);
  const minTime = Date.parse(min);
  return Number.isFinite(valueTime) &&
    Number.isFinite(minTime) &&
    valueTime < minTime
    ? min
    : value;
};

const HOURS = Array.from({ length: 24 }, (_, index) => padTimePart(index));
const MINUTES = Array.from({ length: 60 }, (_, index) => padTimePart(index));

const formatLocalMinute = (value: string) => {
  const time = parseLocalTime(value);
  return time ? `${padTimePart(time.hour)}:${padTimePart(time.minute)}` : value;
};

const formatRenewedReservation = (
  reservation: RenewedPatchReservation,
): string => {
  const { schedule, action } = reservation;
  const actionLabel =
    action.kind === "notify"
      ? "알림만"
      : "자동 업데이트" +
        ("launchAfterUpdate" in action && action.launchAfterUpdate
          ? " · 완료 후 실행"
          : "");

  if (schedule.kind === "once-at") {
    return `한 번 · ${new Date(schedule.at).toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })} · ${actionLabel}`;
  }
  if (schedule.kind === "once-range") {
    const start = new Date(schedule.startsAt).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const end = new Date(schedule.endsAt).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `한 번 · ${start}~${end} · ${schedule.intervalMinutes}분 간격 · ${actionLabel}`;
  }
  if (schedule.kind === "daily") {
    return `매일 · ${formatLocalMinute(schedule.localTime)} · ${actionLabel}`;
  }
  return `매주 ${WEEKDAYS[schedule.weekday]}요일 · ${formatLocalMinute(schedule.localTime)} · ${actionLabel}`;
};

interface TimeSelectProps {
  type: "year" | "month" | "day" | "hour" | "minute";
  value: string;
  options: (string | number)[];
  onChange: (val: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  ariaLabel?: string;
}

const TimeSelect: React.FC<TimeSelectProps> = ({
  type,
  value,
  options,
  onChange,
  isOpen,
  onToggle,
  onClose,
  containerRef,
  ariaLabel,
}) => {
  const listboxId = React.useId();
  const listboxRef = React.useRef<HTMLDivElement>(null);
  const selectedOptionRef = React.useRef<HTMLDivElement>(null);
  const selectedIndex = options.findIndex(
    (option) => option.toString() === value,
  );
  const selectedOptionId =
    selectedIndex >= 0 ? `${listboxId}-option-${selectedIndex}` : undefined;

  React.useLayoutEffect(() => {
    if (!isOpen) return;

    const listbox = listboxRef.current;
    const selectedOption = selectedOptionRef.current;
    if (!listbox || !selectedOption) return;

    const centeredTop =
      selectedOption.offsetTop -
      (listbox.clientHeight - selectedOption.offsetHeight) / 2;
    listbox.scrollTop = Math.max(0, centeredTop);
  }, [isOpen, selectedIndex]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle();
      return;
    }
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Tab" && isOpen) {
      onClose();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    event.preventDefault();
    const currentIndex = options.findIndex(
      (option) => option.toString() === value,
    );
    const offset = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = Math.min(
      options.length - 1,
      Math.max(0, currentIndex + offset),
    );
    const nextValue = options[nextIndex]?.toString();
    if (nextValue) onChange(nextValue);
  };

  return (
    <div
      className="time-select-wrapper"
      ref={containerRef}
      onBlur={(event) => {
        if (
          isOpen &&
          !containerRef.current?.contains(event.relatedTarget as Node | null)
        ) {
          onClose();
        }
      }}
    >
      <div
        className={`time-select-trigger ${isOpen ? "active" : ""}`}
        role="combobox"
        tabIndex={0}
        aria-label={`${ariaLabel ?? type}, 현재 값 ${value}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={isOpen ? selectedOptionId : undefined}
        onClick={onToggle}
        onKeyDown={handleKeyDown}
      >
        {value}
      </div>
      {isOpen && (
        <div
          className="time-select-list"
          role="listbox"
          id={listboxId}
          ref={listboxRef}
        >
          {options.map((opt, index) => (
            <div
              key={opt}
              id={`${listboxId}-option-${index}`}
              ref={value === opt.toString() ? selectedOptionRef : null}
              className={`time-select-item ${value === opt.toString() ? "selected" : ""}`}
              role="option"
              aria-selected={value === opt.toString()}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(opt.toString());
                onClose();
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

type DateTimePart = "year" | "month" | "day" | "hour" | "minute";
const DATE_TIME_PART_LABEL: Record<DateTimePart, string> = {
  year: "연도",
  month: "월",
  day: "일",
  hour: "시",
  minute: "분",
};

interface InlineDateTimeSelectProps {
  value: string;
  min?: string;
  label: string;
  onChange: (value: string) => void;
  onBeforeMinAttempt?: () => void;
  resolveMin?: () => string;
  headerAction?: React.ReactNode;
}

const InlineDateTimeSelect: React.FC<InlineDateTimeSelectProps> = ({
  value,
  min,
  label,
  onChange,
  onBeforeMinAttempt,
  resolveMin,
  headerAction,
}) => {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const refs = useMemo(
    () => ({
      year: React.createRef<HTMLDivElement>(),
      month: React.createRef<HTMLDivElement>(),
      day: React.createRef<HTMLDivElement>(),
      hour: React.createRef<HTMLDivElement>(),
      minute: React.createRef<HTMLDivElement>(),
    }),
    [],
  );
  const [openPart, setOpenPart] = useState<DateTimePart | null>(null);
  const normalizedValue = clampLocalDateTimeInput(
    value || min || toLocalMinuteDateTimeInput(new Date()),
    min,
  );
  const selected = new Date(normalizedValue);
  const selectedDate = Number.isNaN(selected.getTime()) ? new Date() : selected;
  const parts = {
    year: selectedDate.getFullYear().toString(),
    month: padTimePart(selectedDate.getMonth() + 1),
    day: padTimePart(selectedDate.getDate()),
    hour: padTimePart(selectedDate.getHours()),
    minute: padTimePart(selectedDate.getMinutes()),
  };
  const minDate = min ? new Date(min) : new Date();
  const minYear = Number.isNaN(minDate.getTime())
    ? selectedDate.getFullYear()
    : minDate.getFullYear();
  const yearStart = Math.min(minYear, selectedDate.getFullYear());
  const yearEnd = Math.max(minYear + 1, selectedDate.getFullYear());
  const options: Record<DateTimePart, (string | number)[]> = {
    year: Array.from(
      { length: yearEnd - yearStart + 1 },
      (_, index) => yearStart + index,
    ),
    month: Array.from({ length: 12 }, (_, index) => padTimePart(index + 1)),
    day: Array.from(
      {
        length: new Date(Number(parts.year), Number(parts.month), 0).getDate(),
      },
      (_, index) => padTimePart(index + 1),
    ),
    hour: HOURS,
    minute: MINUTES,
  };

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenPart(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const updatePart = (part: DateTimePart, nextValue: string) => {
    const nextParts = { ...parts, [part]: nextValue };
    const maxDay = new Date(
      Number(nextParts.year),
      Number(nextParts.month),
      0,
    ).getDate();
    const nextDate = new Date(
      Number(nextParts.year),
      Number(nextParts.month) - 1,
      Math.min(Number(nextParts.day), maxDay),
      Number(nextParts.hour),
      Number(nextParts.minute),
      0,
    );
    const nextDateTime = toLocalMinuteDateTimeInput(nextDate);
    const effectiveMin = resolveMin?.() ?? min;
    const nextTime = Date.parse(nextDateTime);
    const minTime = effectiveMin ? Date.parse(effectiveMin) : Number.NaN;
    if (
      effectiveMin &&
      Number.isFinite(nextTime) &&
      Number.isFinite(minTime) &&
      nextTime < minTime
    ) {
      onBeforeMinAttempt?.();
    }
    onChange(clampLocalDateTimeInput(nextDateTime, effectiveMin));
  };

  const renderPart = (part: DateTimePart, caption: string) => (
    <div className={`time-select-outer ${part === "year" ? "year" : ""}`}>
      <label>{caption}</label>
      <TimeSelect
        type={part}
        value={parts[part]}
        options={options[part]}
        onChange={(nextValue) => updatePart(part, nextValue)}
        isOpen={openPart === part}
        onToggle={() =>
          setOpenPart((current) => (current === part ? null : part))
        }
        onClose={() => setOpenPart(null)}
        containerRef={refs[part]}
        ariaLabel={`${label} ${DATE_TIME_PART_LABEL[part]}`}
      />
    </div>
  );

  return (
    <div className="renewed-input-field" ref={rootRef}>
      <div className="renewed-input-header">
        <span>{label}</span>
        {headerAction}
      </div>
      <div
        className="form-group-time-grid renewed-inline-date-time"
        aria-label={`${label} 날짜와 시각`}
      >
        {renderPart("year", "YYYY")}
        <span className="time-separator">/</span>
        {renderPart("month", "MM")}
        <span className="time-separator">/</span>
        {renderPart("day", "DD")}
        <span className="time-separator major">|</span>
        {renderPart("hour", "HH")}
        <span className="time-separator">:</span>
        {renderPart("minute", "mm")}
      </div>
    </div>
  );
};

interface InlineTimeSelectProps {
  value: string;
  label: string;
  onChange: (value: string) => void;
}

const InlineTimeSelect: React.FC<InlineTimeSelectProps> = ({
  value,
  label,
  onChange,
}) => {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const refs = useMemo(
    () => ({
      hour: React.createRef<HTMLDivElement>(),
      minute: React.createRef<HTMLDivElement>(),
    }),
    [],
  );
  const [openPart, setOpenPart] = useState<"hour" | "minute" | null>(null);
  const [hour = "00", minute = "00"] = value.split(":");

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenPart(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const renderPart = (
    part: "hour" | "minute",
    caption: string,
    partValue: string,
    partOptions: string[],
  ) => (
    <div className="time-select-outer">
      <label>{caption}</label>
      <TimeSelect
        type={part}
        value={partValue}
        options={partOptions}
        onChange={(nextValue) =>
          onChange(
            [
              part === "hour" ? nextValue : hour,
              part === "minute" ? nextValue : minute,
              "00",
            ].join(":"),
          )
        }
        isOpen={openPart === part}
        onToggle={() =>
          setOpenPart((current) => (current === part ? null : part))
        }
        onClose={() => setOpenPart(null)}
        containerRef={refs[part]}
        ariaLabel={`${label} ${DATE_TIME_PART_LABEL[part]}`}
      />
    </div>
  );

  return (
    <div
      className="form-group-time-grid renewed-inline-clock"
      aria-label={`${label} 시각`}
      ref={rootRef}
    >
      {renderPart("hour", "HH", hour, HOURS)}
      <span className="time-separator">:</span>
      {renderPart("minute", "mm", minute, MINUTES)}
    </div>
  );
};

interface PatchReservationModalProps {
  isOpen: boolean;
  reservations: PatchReservation[];
  renewedReservations: RenewedPatchReservation[];
  activeGame: AppConfig["activeGame"];
  activeService: AppConfig["serviceChannel"];
  silentNotification: boolean;
  terminateAfterPatch: boolean;
  onSilentToggle: (enabled: boolean) => void;
  onTerminateAfterPatchToggle: (enabled: boolean) => void;
  onAdd: (data: Omit<PatchReservation, "id" | "createdAt">) => void;
  onDelete: (id: string) => void;
  onAddRenewed: (
    data: RenewedPatchReservationInput,
  ) => Promise<RenewedPatchReservationCommandResult>;
  onDeleteRenewed: (
    id: string,
  ) => Promise<RenewedPatchReservationCommandResult>;
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
  renewedReservations,
  activeGame,
  activeService,
  silentNotification,
  onSilentToggle,
  onAdd,
  onDelete,
  onAddRenewed,
  onDeleteRenewed,
  onNavigateToSetting,
  launcherConfig,
  terminateAfterPatch,
  onTerminateAfterPatchToggle,
}) => {
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [hour, setHour] = useState("");
  const [minute, setMinute] = useState("");
  const [reservationMode, setReservationMode] = useState<"legacy" | "renewed">(
    "renewed",
  );
  const [renewedRepeat, setRenewedRepeat] = useState<
    "once" | "daily" | "weekly"
  >("once");
  const [onceCheckMode, setOnceCheckMode] = useState<"at" | "range">("at");
  const [renewedStartsAt, setRenewedStartsAt] = useState("");
  const [renewedEndsAt, setRenewedEndsAt] = useState("");
  const [rangeEndMode, setRangeEndMode] = useState<"hours" | "custom">("hours");
  const [rangeDurationHours, setRangeDurationHours] = useState("1");
  const [renewedLocalTime, setRenewedLocalTime] = useState("");
  const [renewedWeekday, setRenewedWeekday] = useState(new Date().getDay());
  const [renewedInterval, setRenewedInterval] = useState("1");
  const [renewedAction, setRenewedAction] = useState<"notify" | "auto-update">(
    "auto-update",
  );
  const [onlyNewVersion, setOnlyNewVersion] = useState(true);
  const [launchAfterUpdate, setLaunchAfterUpdate] = useState(false);
  const [isRangeWarningOpen, setIsRangeWarningOpen] = useState(false);

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
      const openedAt = new Date();
      setCurrentTime(openedAt);
      setTimeout(() => {
        setSelectedGame(activeGame);
        setSelectedService(activeService);

        const initialDate = openedAt; // Default to the fresh modal-open time

        setYear(initialDate.getFullYear().toString());
        setMonth((initialDate.getMonth() + 1).toString().padStart(2, "0"));
        setDay(initialDate.getDate().toString().padStart(2, "0"));
        setHour(initialDate.getHours().toString().padStart(2, "0"));
        setMinute(initialDate.getMinutes().toString().padStart(2, "0"));

        const renewedStart = initialDate;
        const renewedEnd = new Date(initialDate.getTime() + 30 * 60_000);
        setReservationMode("renewed");
        setRenewedRepeat("once");
        setOnceCheckMode("at");
        setRenewedStartsAt(toLocalMinuteDateTimeInput(renewedStart));
        setRenewedEndsAt(toLocalMinuteDateTimeInput(renewedEnd));
        setRangeEndMode("hours");
        setRangeDurationHours("1");
        setRenewedLocalTime(toLocalMinuteTimeInput(renewedStart));
        setRenewedWeekday(renewedStart.getDay());
        setRenewedInterval("1");
        setRenewedAction("auto-update");
        setOnlyNewVersion(true);
        setLaunchAfterUpdate(false);
        setIsRangeWarningOpen(false);
      }, 0);
    }
    lastOpenRef.current = isOpen;
  }, [isOpen, activeGame, activeService]);

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
    const currentSelectionNeedsAutoPatch =
      reservationMode === "legacy" || renewedAction === "auto-update";
    const autoPatchServices = new Set<string>(
      reservations.map((reservation) => reservation.serviceId),
    );
    renewedReservations
      .filter((reservation) => reservation.action.kind === "auto-update")
      .forEach((reservation) => autoPatchServices.add(reservation.serviceId));
    if (currentSelectionNeedsAutoPatch) {
      autoPatchServices.add(selectedService);
    }

    const needsKakaoChecks = autoPatchServices.has("Kakao Games");
    const needsAutoPatchChecks = autoPatchServices.size > 0;

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
        condition: needsAutoPatchChecks && !localConfig.autoFixPatchError,
      },
    ];

    return checks
      .filter((c) => c.condition)
      .sort((a, b) => {
        if (a.level === "error" && b.level !== "error") return -1;
        if (a.level !== "error" && b.level === "error") return 1;
        return 0;
      });
  }, [
    localConfig,
    selectedService,
    reservations,
    renewedReservations,
    reservationMode,
    renewedAction,
  ]);

  const hasError = useMemo(
    () => stabilityChecks.some((c) => c.level === "error"),
    [stabilityChecks],
  );

  const effectiveRenewedEndsAt = useMemo(
    () =>
      rangeEndMode === "hours"
        ? addHoursToLocalDateTimeInput(
            renewedStartsAt,
            Number(rangeDurationHours),
          )
        : renewedEndsAt,
    [rangeDurationHours, rangeEndMode, renewedEndsAt, renewedStartsAt],
  );

  const expectedRangeChecks = useMemo(
    () =>
      calculateRangeCheckCount(
        renewedStartsAt,
        effectiveRenewedEndsAt,
        Number(renewedInterval),
      ),
    [renewedStartsAt, effectiveRenewedEndsAt, renewedInterval],
  );

  const handleRenewedStartChange = useCallback(
    (nextValue: string) => {
      const currentEndTime = Date.parse(renewedEndsAt);
      const nextStartTime = Date.parse(nextValue);

      setRenewedStartsAt(nextValue);
      if (
        Number.isFinite(nextStartTime) &&
        (!Number.isFinite(currentEndTime) || currentEndTime <= nextStartTime)
      ) {
        setRenewedEndsAt(
          toLocalMinuteDateTimeInput(new Date(nextStartTime + 30 * 60_000)),
        );
      }
    },
    [renewedEndsAt],
  );

  // Match the legacy picker: once the selected start passes, keep it on the
  // current minute while the modal stays open.
  useEffect(() => {
    if (!isOpen || renewedRepeat !== "once") return;

    const currentMinute = toLocalMinuteDateTimeInput(currentTime);
    if (Date.parse(renewedStartsAt) >= Date.parse(currentMinute)) return;

    const timer = setTimeout(() => {
      if (isOpen) handleRenewedStartChange(currentMinute);
    }, 0);
    return () => clearTimeout(timer);
  }, [
    currentTime,
    handleRenewedStartChange,
    isOpen,
    renewedRepeat,
    renewedStartsAt,
  ]);

  const renewedFormInvalidReason = useMemo(() => {
    if (renewedRepeat === "daily") {
      return parseLocalTime(renewedLocalTime)
        ? null
        : "확인 시각을 올바르게 설정해주세요.";
    }
    if (renewedRepeat === "weekly") {
      return parseLocalTime(renewedLocalTime) !== null &&
        renewedWeekday >= 0 &&
        renewedWeekday <= 6
        ? null
        : "요일과 확인 시각을 올바르게 설정해주세요.";
    }

    const start = Date.parse(renewedStartsAt);
    if (!Number.isFinite(start)) {
      return onceCheckMode === "at"
        ? "확인 시각을 올바르게 설정해주세요."
        : "시작 시각을 올바르게 설정해주세요.";
    }
    if (start <= currentTime.getTime()) {
      return onceCheckMode === "at"
        ? "확인 시각을 현재보다 이후로 설정해주세요."
        : "시작 시각을 현재보다 이후로 설정해주세요.";
    }
    if (onceCheckMode === "at") return null;

    const durationHours = Number(rangeDurationHours);
    if (
      rangeEndMode === "hours" &&
      (!Number.isInteger(durationHours) || durationHours < 1)
    ) {
      return "예약 시간을 1시간 이상의 정수로 입력해주세요.";
    }

    const end = Date.parse(effectiveRenewedEndsAt);
    if (!Number.isFinite(end) || end <= start) {
      return "종료 시각을 시작 시각보다 이후로 설정해주세요.";
    }

    return Number.isInteger(Number(renewedInterval)) &&
      Number(renewedInterval) >= 1
      ? null
      : "확인 간격을 1분 이상의 정수로 입력해주세요.";
  }, [
    renewedRepeat,
    renewedLocalTime,
    renewedWeekday,
    renewedStartsAt,
    effectiveRenewedEndsAt,
    renewedInterval,
    rangeDurationHours,
    rangeEndMode,
    onceCheckMode,
    currentTime,
  ]);

  const legacyFormInvalidReason = useMemo(() => {
    if (!(year && month && day && hour && minute)) {
      return "예약 시간을 모두 설정해주세요.";
    }
    if (isNow) {
      return "현재 시간으로는 예약할 수 없습니다. 시간을 다시 설정해주세요.";
    }

    const targetDate = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
    );
    return Number.isFinite(targetDate.getTime())
      ? null
      : "예약 시간을 올바르게 설정해주세요.";
  }, [day, hour, isNow, minute, month, year]);

  const addUnavailableReason = hasError
    ? "현재 설정으로는 예약 패치가 불가능합니다. '확인 필요' 항목을 해결해주세요."
    : reservationMode === "renewed"
      ? renewedFormInvalidReason
      : legacyFormInvalidReason;
  const isAddUnavailable = addUnavailableReason !== null;

  if (!isOpen) return null;

  const handleAdd = async () => {
    if (addUnavailableReason) {
      showToast(addUnavailableReason);
      return;
    }

    if (reservationMode === "renewed") {
      if (
        renewedRepeat === "once" &&
        Date.parse(renewedStartsAt) <= Date.now()
      ) {
        showToast("이미 지난 시각에는 리뉴얼 예약을 추가할 수 없습니다.");
        return;
      }

      const common = {
        gameId: selectedGame,
        serviceId: selectedService,
      };
      let renewedReservation: RenewedPatchReservationInput;

      if (renewedRepeat === "once") {
        const schedule =
          onceCheckMode === "at"
            ? {
                kind: "once-at" as const,
                at: new Date(renewedStartsAt).toISOString(),
              }
            : {
                kind: "once-range" as const,
                startsAt: new Date(renewedStartsAt).toISOString(),
                endsAt: new Date(effectiveRenewedEndsAt).toISOString(),
                intervalMinutes: Number(renewedInterval),
              };
        renewedReservation = {
          ...common,
          schedule,
          action:
            renewedAction === "notify"
              ? { kind: "notify" }
              : {
                  kind: "auto-update",
                  launchAfterUpdate,
                },
        };
      } else {
        const schedule =
          renewedRepeat === "daily"
            ? {
                kind: "daily" as const,
                localTime: renewedLocalTime,
              }
            : {
                kind: "weekly" as const,
                weekday: renewedWeekday,
                localTime: renewedLocalTime,
              };
        renewedReservation = {
          ...common,
          schedule,
          action:
            renewedAction === "notify"
              ? {
                  kind: "notify",
                  onlyNewVersion,
                }
              : { kind: "auto-update" },
        };
      }

      const result = await onAddRenewed(renewedReservation);
      if (!result.ok) {
        showToast("리뉴얼 패치 예약을 추가하지 못했습니다. 다시 시도해주세요.");
        return;
      }
      showToast("새로운 리뉴얼 패치 예약이 추가되었습니다.");
      return;
    }

    const targetDate = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
    );

    onAdd({
      gameId: selectedGame,
      serviceId: selectedService,
      targetTime: targetDate.toISOString(),
    });
    showToast("새로운 패치 예약이 추가되었습니다.");
  };

  const handleDeleteRenewed = async (id: string) => {
    try {
      const result = await onDeleteRenewed(id);
      showToast(
        result.ok
          ? "리뉴얼 패치 예약을 삭제했습니다."
          : "리뉴얼 패치 예약을 삭제하지 못했습니다. 목록을 확인해주세요.",
      );
    } catch {
      showToast("리뉴얼 패치 예약을 삭제하지 못했습니다. 다시 시도해주세요.");
    }
  };

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
              {reservationMode === "legacy"
                ? "원하는 시간에 게임 패치를 자동으로 시작합니다."
                : "최신 버전이 확인되면 알림을 보내거나 업데이트를 시작합니다."}
              <br />
              <span className="warning-text">
                {reservationMode === "legacy"
                  ? "※ 예약 실행 시간에 게임이 이미 켜져 있으면 정상적으로 동작하지 않습니다."
                  : "※ 런처가 실행 중인 동안에만 예약 확인이 동작합니다."}
              </span>
            </div>
          </div>
          <button className="btn-close-icon" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="patch-body">
          <div className="patch-workspace">
            <div className="patch-form-pane">
              {/* Section 1: Add Reservation */}
              <div className="section-header">
                <span className="title">새로운 예약 추가</span>
                <div
                  className="reservation-mode-switch"
                  role="group"
                  aria-label="예약 방식"
                >
                  <button
                    type="button"
                    className={reservationMode === "legacy" ? "selected" : ""}
                    aria-pressed={reservationMode === "legacy"}
                    onClick={() => setReservationMode("legacy")}
                  >
                    레거시
                  </button>
                  <button
                    type="button"
                    className={reservationMode === "renewed" ? "selected" : ""}
                    aria-pressed={reservationMode === "renewed"}
                    onClick={() => setReservationMode("renewed")}
                  >
                    리뉴얼
                  </button>
                </div>
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
                            Object.keys(
                              GAME_CONFIG,
                            ) as AppConfig["activeGame"][]
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

                {reservationMode === "legacy" ? (
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
                            setOpenDropdown(
                              openDropdown === "year" ? null : "year",
                            )
                          }
                          onClose={() => setOpenDropdown(null)}
                          containerRef={yearRef}
                          ariaLabel="예약 시간 연도"
                        />
                      </div>
                      <div className="time-separator">/</div>
                      <div
                        className={`time-select-outer ${isNow ? "is-now" : ""}`}
                      >
                        <label>MM</label>
                        <TimeSelect
                          type="month"
                          value={month}
                          options={timeOptions.months}
                          onChange={(val) => updateAndValidateTime({ m: val })}
                          isOpen={openDropdown === "month"}
                          onToggle={() =>
                            setOpenDropdown(
                              openDropdown === "month" ? null : "month",
                            )
                          }
                          onClose={() => setOpenDropdown(null)}
                          containerRef={monthRef}
                          ariaLabel="예약 시간 월"
                        />
                      </div>
                      <div className="time-separator">/</div>
                      <div
                        className={`time-select-outer ${isNow ? "is-now" : ""}`}
                      >
                        <label>DD</label>
                        <TimeSelect
                          type="day"
                          value={day}
                          options={timeOptions.days}
                          onChange={(val) => updateAndValidateTime({ d: val })}
                          isOpen={openDropdown === "day"}
                          onToggle={() =>
                            setOpenDropdown(
                              openDropdown === "day" ? null : "day",
                            )
                          }
                          onClose={() => setOpenDropdown(null)}
                          containerRef={dayRef}
                          ariaLabel="예약 시간 일"
                        />
                      </div>
                      <div
                        className="time-separator"
                        style={{ margin: "14px 8px 0" }}
                      >
                        |
                      </div>
                      <div
                        className={`time-select-outer ${isNow ? "is-now" : ""}`}
                      >
                        <label>HH</label>
                        <TimeSelect
                          type="hour"
                          value={hour}
                          options={timeOptions.hours}
                          onChange={(val) => updateAndValidateTime({ h: val })}
                          isOpen={openDropdown === "hour"}
                          onToggle={() =>
                            setOpenDropdown(
                              openDropdown === "hour" ? null : "hour",
                            )
                          }
                          onClose={() => setOpenDropdown(null)}
                          containerRef={hourRef}
                          ariaLabel="예약 시간 시"
                        />
                      </div>
                      <div className="time-separator">:</div>
                      <div
                        className={`time-select-outer ${isNow ? "is-now" : ""}`}
                      >
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
                          onClose={() => setOpenDropdown(null)}
                          containerRef={minuteRef}
                          ariaLabel="예약 시간 분"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="form-group">
                      <label>확인 주기</label>
                      <div className="patch-segmented-control three">
                        {(["once", "daily", "weekly"] as const).map(
                          (repeat) => (
                            <button
                              type="button"
                              key={repeat}
                              className={
                                renewedRepeat === repeat ? "selected" : ""
                              }
                              onClick={() => setRenewedRepeat(repeat)}
                            >
                              {repeat === "once"
                                ? "한 번"
                                : repeat === "daily"
                                  ? "매일"
                                  : "매주"}
                            </button>
                          ),
                        )}
                      </div>
                    </div>

                    {renewedRepeat === "once" ? (
                      <>
                        <div className="form-group">
                          <label>확인 방식</label>
                          <div className="patch-segmented-control">
                            <button
                              type="button"
                              className={
                                onceCheckMode === "at" ? "selected" : ""
                              }
                              onClick={() => setOnceCheckMode("at")}
                            >
                              지정 시각
                            </button>
                            <button
                              type="button"
                              className={
                                onceCheckMode === "range" ? "selected" : ""
                              }
                              onClick={() => setOnceCheckMode("range")}
                            >
                              시간 범위
                            </button>
                          </div>
                        </div>

                        <div className="renewed-time-fields once">
                          <InlineDateTimeSelect
                            label={
                              onceCheckMode === "at" ? "확인 시각" : "시작"
                            }
                            min={toLocalMinuteDateTimeInput(currentTime)}
                            value={renewedStartsAt}
                            onChange={handleRenewedStartChange}
                            resolveMin={toCurrentLocalMinuteInput}
                            onBeforeMinAttempt={() =>
                              showToast("현재보다 과거로 설정할 수 없습니다.")
                            }
                          />
                          {onceCheckMode === "range" && (
                            <>
                              {rangeEndMode === "hours" ? (
                                <div className="renewed-input-field">
                                  <div className="renewed-input-header">
                                    <span>종료</span>
                                    <div
                                      className="range-end-mode-switch"
                                      role="group"
                                      aria-label="종료 방식"
                                    >
                                      <button
                                        type="button"
                                        className="selected"
                                        aria-pressed="true"
                                      >
                                        시간 단위
                                      </button>
                                      <button
                                        type="button"
                                        aria-pressed="false"
                                        onClick={() => {
                                          if (effectiveRenewedEndsAt) {
                                            setRenewedEndsAt(
                                              effectiveRenewedEndsAt,
                                            );
                                          }
                                          setRangeEndMode("custom");
                                        }}
                                      >
                                        사용자 지정
                                      </button>
                                    </div>
                                  </div>
                                  <div className="range-duration-input">
                                    <span>시작 시각부터</span>
                                    <input
                                      type="number"
                                      min="1"
                                      step="1"
                                      aria-label="예약 시간"
                                      value={rangeDurationHours}
                                      onChange={(event) =>
                                        setRangeDurationHours(
                                          event.target.value,
                                        )
                                      }
                                    />
                                    <span>시간 동안</span>
                                  </div>
                                </div>
                              ) : (
                                <InlineDateTimeSelect
                                  label="종료"
                                  min={renewedStartsAt}
                                  value={renewedEndsAt}
                                  onChange={setRenewedEndsAt}
                                  headerAction={
                                    <div
                                      className="range-end-mode-switch"
                                      role="group"
                                      aria-label="종료 방식"
                                    >
                                      <button
                                        type="button"
                                        aria-pressed="false"
                                        onClick={() => setRangeEndMode("hours")}
                                      >
                                        시간 단위
                                      </button>
                                      <button
                                        type="button"
                                        className="selected"
                                        aria-pressed="true"
                                      >
                                        사용자 지정
                                      </button>
                                    </div>
                                  }
                                />
                              )}
                            </>
                          )}
                        </div>

                        {onceCheckMode === "range" && (
                          <div className="range-check-row">
                            <label className="renewed-input-field interval">
                              <span>확인 간격</span>
                              <div className="interval-input">
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={renewedInterval}
                                  onChange={(event) =>
                                    setRenewedInterval(event.target.value)
                                  }
                                />
                                <span>분</span>
                              </div>
                            </label>
                            <div className="expected-check-count">
                              예상 최대 {expectedRangeChecks}회
                              {expectedRangeChecks > 180 && (
                                <button
                                  type="button"
                                  className={`range-warning ${isRangeWarningOpen ? "open" : ""}`}
                                  aria-label={RANGE_CHECK_WARNING}
                                  aria-expanded={isRangeWarningOpen}
                                  onClick={() =>
                                    setIsRangeWarningOpen((open) => !open)
                                  }
                                >
                                  <span className="material-symbols-outlined">
                                    error
                                  </span>
                                  <span className="range-warning-tooltip">
                                    {RANGE_CHECK_WARNING}
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="renewed-time-fields recurring">
                        {renewedRepeat === "weekly" && (
                          <label className="renewed-input-field weekday">
                            <span>요일</span>
                            <select
                              value={renewedWeekday}
                              onChange={(event) =>
                                setRenewedWeekday(Number(event.target.value))
                              }
                            >
                              {WEEKDAYS.map((weekday, index) => (
                                <option key={weekday} value={index}>
                                  {weekday}요일
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <div className="renewed-input-field">
                          <span>확인 시각</span>
                          <InlineTimeSelect
                            value={renewedLocalTime}
                            label="확인 시각"
                            onChange={setRenewedLocalTime}
                          />
                        </div>
                      </div>
                    )}

                    <div className="form-group">
                      <label>업데이트 감지 후</label>
                      <div className="patch-segmented-control">
                        <button
                          type="button"
                          className={
                            renewedAction === "auto-update" ? "selected" : ""
                          }
                          onClick={() => setRenewedAction("auto-update")}
                        >
                          자동 업데이트
                        </button>
                        <button
                          type="button"
                          className={
                            renewedAction === "notify" ? "selected" : ""
                          }
                          onClick={() => setRenewedAction("notify")}
                        >
                          알림만
                        </button>
                      </div>
                    </div>

                    {renewedRepeat !== "once" && renewedAction === "notify" && (
                      <label className="renewed-checkbox-wrapper">
                        <input
                          type="checkbox"
                          checked={onlyNewVersion}
                          onChange={(event) =>
                            setOnlyNewVersion(event.target.checked)
                          }
                        />
                        <span>새로운 업데이트일 때만 알림</span>
                      </label>
                    )}

                    {renewedRepeat === "once" &&
                      renewedAction === "auto-update" && (
                        <label className="renewed-checkbox-wrapper">
                          <input
                            type="checkbox"
                            checked={launchAfterUpdate}
                            onChange={(event) =>
                              setLaunchAfterUpdate(event.target.checked)
                            }
                          />
                          <span>업데이트 완료 후 게임 실행</span>
                        </label>
                      )}
                  </>
                )}

                <button
                  className={`btn-add-reservation ${
                    isAddUnavailable ? "has-error is-disabled" : ""
                  }`}
                  onClick={handleAdd}
                  aria-disabled={isAddUnavailable}
                  title={addUnavailableReason ?? undefined}
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
                            onClick={() =>
                              onNavigateToSetting?.(check.configId!)
                            }
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
            </div>

            {/* Section 3: Current Reservations */}
            <div className="reservation-list-section">
              <div className="section-header">
                <span className="title">현재 예약 목록</span>
                <span className="count">
                  {reservations.length + renewedReservations.length}개
                </span>
              </div>

              <div className="reservation-list">
                {reservations.length + renewedReservations.length === 0 ? (
                  <div className="empty-list">예약된 항목이 없습니다.</div>
                ) : (
                  <>
                    {[...reservations]
                      .sort(
                        (a, b) =>
                          new Date(a.targetTime).getTime() -
                          new Date(b.targetTime).getTime(),
                      )
                      .map((res) => (
                        <div
                          key={`legacy-${res.id}`}
                          className="reservation-item"
                        >
                          <div className="res-info">
                            <div className="res-game-service">
                              <span
                                className={`badge ${res.serviceId.replace(" ", "-").toLowerCase()}`}
                              >
                                {res.serviceId}
                              </span>
                              <span className="game-name">{res.gameId}</span>
                              <span className="reservation-kind-badge">
                                레거시
                              </span>
                            </div>
                            <div className="res-time">
                              한 번 ·{" "}
                              {new Date(res.targetTime).toLocaleString(
                                "ko-KR",
                                {
                                  year: "numeric",
                                  month: "2-digit",
                                  day: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: false,
                                },
                              )}
                              {" · 자동 업데이트"}
                            </div>
                          </div>
                          <button
                            className="btn-delete"
                            onClick={() => onDelete(res.id)}
                            aria-label="레거시 예약 삭제"
                          >
                            <span className="material-symbols-outlined">
                              delete
                            </span>
                          </button>
                        </div>
                      ))}
                    {[...renewedReservations]
                      .sort(
                        (a, b) =>
                          Date.parse(
                            a.schedule.kind === "once-at"
                              ? a.schedule.at
                              : a.schedule.kind === "once-range"
                                ? a.schedule.startsAt
                                : a.createdAt,
                          ) -
                          Date.parse(
                            b.schedule.kind === "once-at"
                              ? b.schedule.at
                              : b.schedule.kind === "once-range"
                                ? b.schedule.startsAt
                                : b.createdAt,
                          ),
                      )
                      .map((res) => (
                        <div
                          key={`renewed-${res.id}`}
                          className="reservation-item"
                        >
                          <div className="res-info">
                            <div className="res-game-service">
                              <span
                                className={`badge ${res.serviceId.replace(" ", "-").toLowerCase()}`}
                              >
                                {res.serviceId}
                              </span>
                              <span className="game-name">{res.gameId}</span>
                              <span className="reservation-kind-badge renewed">
                                리뉴얼
                              </span>
                            </div>
                            <div className="res-time">
                              {formatRenewedReservation(res)}
                            </div>
                          </div>
                          <button
                            className="btn-delete"
                            onClick={() => void handleDeleteRenewed(res.id)}
                            aria-label="리뉴얼 예약 삭제"
                          >
                            <span className="material-symbols-outlined">
                              delete
                            </span>
                          </button>
                        </div>
                      ))}
                  </>
                )}
              </div>
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

          {reservationMode === "legacy" && (
            <label className="terminate-checkbox-wrapper">
              <div className="checkbox-container">
                <input
                  type="checkbox"
                  checked={terminateAfterPatch}
                  onChange={() => {
                    const newState = !terminateAfterPatch;
                    onTerminateAfterPatchToggle(newState);
                    showToast(
                      newState
                        ? "패치 성공 후 게임 및 런처를 자동으로 종료합니다."
                        : "패치 성공 후에도 런처와 게임을 종료하지 않습니다.",
                    );
                  }}
                />
                <span className="checkbox-custom">
                  <span className="material-symbols-outlined check-icon">
                    check
                  </span>
                </span>
              </div>
              <span className="checkbox-label">
                패치 성공 시 게임 및 런처 종료
              </span>
            </label>
          )}
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
