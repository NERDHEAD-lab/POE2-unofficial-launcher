import React, { useState, useEffect, useMemo, useCallback } from "react";

import "./PatchReservationModal.css";
import { PatchReservation, AppConfig } from "../../../shared/types";
import imgGGG from "../../assets/img-ci-ggg_150x67.png";
import imgKakao from "../../assets/img-ci-kakaogames_158x28.png";
import logoPoe1 from "../../assets/poe1/logo.png";
import logoPoe2 from "../../assets/poe2/logo.png";

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
  onClose: () => void;
  reservations: PatchReservation[];
  activeGame: AppConfig["activeGame"];
  activeService: AppConfig["serviceChannel"];
  onAdd: (reservation: Omit<PatchReservation, "id" | "createdAt">) => void;
  onDelete: (id: string) => void;
}

export const PatchReservationModal: React.FC<PatchReservationModalProps> = ({
  isOpen,
  onClose,
  reservations,
  activeGame,
  activeService,
  onAdd,
  onDelete,
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

  const [isServiceOpen, setIsServiceOpen] = useState(false);
  const [isGameOpen, setIsGameOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

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
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const currentDay = now.getDate();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      const parseVal = (v: string | undefined, fallback: number) => {
        if (v === undefined || v === "") return fallback;
        const parsed = parseInt(v);
        return isNaN(parsed) ? fallback : parsed;
      };

      let ty = parseVal(newValues.y ?? year, currentYear);
      let tm = parseVal(newValues.m ?? month, currentMonth);
      let td = parseVal(newValues.d ?? day, currentDay);
      let th = parseVal(newValues.h ?? hour, currentHour);
      let tmi = parseVal(newValues.mi ?? minute, currentMinute);

      // 1. Month-end adjustment (clamping day)
      const maxDays = new Date(ty, tm, 0).getDate();
      if (td > maxDays) td = maxDays;

      // 2. Future time check & auto-correction
      if (ty === currentYear) {
        if (tm < currentMonth) {
          tm = currentMonth;
          td = currentDay;
          th = currentHour;
          tmi = currentMinute + 1;
        } else if (tm === currentMonth) {
          if (td < currentDay) {
            td = currentDay;
            th = currentHour;
            tmi = currentMinute + 1;
          } else if (td === currentDay) {
            if (th < currentHour) {
              th = currentHour;
              tmi = currentMinute + 1;
            } else if (th === currentHour) {
              if (tmi <= currentMinute) {
                tmi = currentMinute + 1;
              }
            }
          }
        }
      }

      // 3. Overflow handling (minute/hour/day/month)
      if (tmi >= 60) {
        tmi = 0;
        th += 1;
      }
      if (th >= 24) {
        th = 0;
        td += 1;
      }
      const finalMaxDays = new Date(ty, tm, 0).getDate();
      if (td > finalMaxDays) {
        td = 1;
        tm += 1;
      }
      if (tm > 12) {
        tm = 1;
        ty += 1;
      }

      setYear(ty.toString());
      setMonth(tm.toString().padStart(2, "0"));
      setDay(td.toString().padStart(2, "0"));
      setHour(th.toString().padStart(2, "0"));
      setMinute(tmi.toString().padStart(2, "0"));
    },
    [year, month, day, hour, minute],
  );

  // Time Options Filtering (Disable past times)
  const timeOptions = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

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
        parseInt(mi) > currentMinute,
    );

    return { years, months, days, hours, minutes };
  }, [year, month, day, hour]);

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
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        setSelectedGame(activeGame);
        setSelectedService(activeService);

        const now = new Date();
        now.setHours(now.getHours() + 1);

        setYear(now.getFullYear().toString());
        setMonth((now.getMonth() + 1).toString().padStart(2, "0"));
        setDay(now.getDate().toString().padStart(2, "0"));
        setHour(now.getHours().toString().padStart(2, "0"));
        setMinute(now.getMinutes().toString().padStart(2, "0"));
      }, 0);
    }
  }, [isOpen, activeGame, activeService]);

  if (!isOpen) return null;

  const handleAdd = () => {
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
            </div>
          </div>
          <button className="btn-close-icon" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="patch-body">
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
                <div className="time-select-outer year">
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
                <div className="time-select-outer">
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
                <div className="time-select-outer">
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
                <div className="time-select-outer">
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
                <div className="time-select-outer">
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
              className="btn-add-reservation"
              onClick={handleAdd}
              disabled={!isFormValid}
            >
              <span className="material-symbols-outlined">add</span>
              예약 추가하기
            </button>
          </div>

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
          <button className="btn-confirm" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
