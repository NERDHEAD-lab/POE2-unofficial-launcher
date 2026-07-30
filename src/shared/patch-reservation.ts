import { ACTIVE_GAMES, SERVICE_CHANNELS } from "./types";

import type { RenewedPatchReservation } from "./types";

const LOCAL_TIME_PATTERN = /^(\d{2}):(\d{2}):(\d{2})$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isValidIsoDate = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

export function parseLocalTime(
  value: string,
): { hour: number; minute: number; second: number } | null {
  const match = LOCAL_TIME_PATTERN.exec(value);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3]);
  if (hour > 23 || minute > 59 || second > 59) return null;

  return { hour, minute, second };
}

export function calculateRangeCheckCount(
  startsAt: string,
  endsAt: string,
  intervalMinutes: number,
): number {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    !Number.isInteger(intervalMinutes) ||
    intervalMinutes < 1
  ) {
    return 0;
  }

  return Math.floor((end - start) / (intervalMinutes * 60_000)) + 1;
}

export function getNextRecurringOccurrence(
  reservation: RenewedPatchReservation,
  now: Date,
): Date | null {
  const { schedule } = reservation;
  if (schedule.kind !== "daily" && schedule.kind !== "weekly") return null;

  const time = parseLocalTime(schedule.localTime);
  if (!time) return null;

  const candidate = new Date(now);
  candidate.setHours(time.hour, time.minute, time.second, 0);

  if (schedule.kind === "daily") {
    if (candidate.getTime() <= now.getTime()) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate;
  }

  const daysUntilTarget = (schedule.weekday - candidate.getDay() + 7) % 7;
  candidate.setDate(candidate.getDate() + daysUntilTarget);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 7);
  }
  return candidate;
}

export function isRenewedPatchReservation(
  value: unknown,
): value is RenewedPatchReservation {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string" ||
    value.id.trim().length === 0 ||
    !ACTIVE_GAMES.includes(value.gameId as (typeof ACTIVE_GAMES)[number]) ||
    !SERVICE_CHANNELS.includes(
      value.serviceId as (typeof SERVICE_CHANNELS)[number],
    ) ||
    !isValidIsoDate(value.createdAt) ||
    !isRecord(value.schedule) ||
    !isRecord(value.action)
  ) {
    return false;
  }

  if (
    value.lastNotifiedVersion !== undefined &&
    typeof value.lastNotifiedVersion !== "string"
  ) {
    return false;
  }

  const schedule = value.schedule;
  const action = value.action;

  if (schedule.kind === "once-at") {
    return (
      isValidIsoDate(schedule.at) &&
      ((action.kind === "notify" && !("onlyNewVersion" in action)) ||
        (action.kind === "auto-update" &&
          typeof action.launchAfterUpdate === "boolean"))
    );
  }

  if (schedule.kind === "once-range") {
    return (
      isValidIsoDate(schedule.startsAt) &&
      isValidIsoDate(schedule.endsAt) &&
      Date.parse(schedule.endsAt) > Date.parse(schedule.startsAt) &&
      Number.isInteger(schedule.intervalMinutes) &&
      Number(schedule.intervalMinutes) >= 1 &&
      ((action.kind === "notify" && !("onlyNewVersion" in action)) ||
        (action.kind === "auto-update" &&
          typeof action.launchAfterUpdate === "boolean"))
    );
  }

  if (schedule.kind !== "daily" && schedule.kind !== "weekly") return false;
  if (
    typeof schedule.localTime !== "string" ||
    !parseLocalTime(schedule.localTime)
  ) {
    return false;
  }
  if (
    schedule.kind === "weekly" &&
    (!Number.isInteger(schedule.weekday) ||
      Number(schedule.weekday) < 0 ||
      Number(schedule.weekday) > 6)
  ) {
    return false;
  }

  return (
    (action.kind === "notify" && typeof action.onlyNewVersion === "boolean") ||
    (action.kind === "auto-update" && !("launchAfterUpdate" in action))
  );
}
