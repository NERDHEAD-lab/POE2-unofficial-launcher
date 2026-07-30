import { describe, expect, it } from "vitest";

import { CONFIG_METADATA, DEFAULT_CONFIG } from "./config";
import {
  calculateRangeCheckCount,
  getNextRecurringOccurrence,
  isRenewedPatchReservation,
  parseLocalTime,
} from "./patch-reservation";

import type { RenewedPatchReservation } from "./types";

const base = {
  id: "renewed-1",
  gameId: "POE2" as const,
  serviceId: "Kakao Games" as const,
  createdAt: "2026-07-25T00:00:00.000Z",
};

describe("renewed patch reservation contract", () => {
  it("registers the additive config key without changing the legacy default", () => {
    expect(CONFIG_METADATA.RENEWED_PATCH_RESERVATIONS.key).toBe(
      "renewedPatchReservations",
    );
    expect(DEFAULT_CONFIG.patchReservations).toEqual([]);
    expect(DEFAULT_CONFIG.renewedPatchReservations).toEqual([]);
  });

  it("counts the immediate range check and keeps the 180/181 boundary exact", () => {
    expect(
      calculateRangeCheckCount(
        "2026-07-25T00:00:00.000Z",
        "2026-07-25T02:59:00.000Z",
        1,
      ),
    ).toBe(180);
    expect(
      calculateRangeCheckCount(
        "2026-07-25T00:00:00.000Z",
        "2026-07-25T03:00:00.000Z",
        1,
      ),
    ).toBe(181);
  });

  it("rejects invalid ranges and intervals below one minute", () => {
    expect(
      calculateRangeCheckCount(
        "2026-07-25T00:00:00.000Z",
        "2026-07-25T01:00:00.000Z",
        0,
      ),
    ).toBe(0);
    expect(
      calculateRangeCheckCount(
        "2026-07-25T01:00:00.000Z",
        "2026-07-25T00:00:00.000Z",
        1,
      ),
    ).toBe(0);
  });

  it("parses local wall-clock times including seconds", () => {
    expect(parseLocalTime("23:59:58")).toEqual({
      hour: 23,
      minute: 59,
      second: 58,
    });
    expect(parseLocalTime("24:00:00")).toBeNull();
  });

  it("calculates the next daily and weekly occurrence without catch-up", () => {
    const now = new Date(2026, 6, 25, 9, 30, 0);
    const daily = {
      ...base,
      schedule: { kind: "daily", localTime: "09:00:00" },
      action: { kind: "notify", onlyNewVersion: true },
    } satisfies RenewedPatchReservation;
    const weekly = {
      ...base,
      schedule: { kind: "weekly", weekday: 6, localTime: "09:00:00" },
      action: { kind: "auto-update" },
    } satisfies RenewedPatchReservation;

    expect(getNextRecurringOccurrence(daily, now)).toEqual(
      new Date(2026, 6, 26, 9, 0, 0),
    );
    expect(getNextRecurringOccurrence(weekly, now)).toEqual(
      new Date(2026, 7, 1, 9, 0, 0),
    );
  });

  it("rolls recurring occurrences across month and year boundaries", () => {
    const daily = {
      ...base,
      schedule: { kind: "daily", localTime: "00:00:01" },
      action: { kind: "notify", onlyNewVersion: true },
    } satisfies RenewedPatchReservation;
    const weekly = {
      ...base,
      schedule: { kind: "weekly", weekday: 0, localTime: "00:00:01" },
      action: { kind: "auto-update" },
    } satisfies RenewedPatchReservation;

    expect(
      getNextRecurringOccurrence(daily, new Date(2026, 11, 31, 23, 59, 59)),
    ).toEqual(new Date(2027, 0, 1, 0, 0, 1));
    expect(
      getNextRecurringOccurrence(
        weekly,
        new Date(2026, 11, 31, 23, 59, 59),
      )?.getDay(),
    ).toBe(0);
  });

  it("keeps the requested wall-clock time across a daylight-saving boundary", () => {
    const previousTimeZone = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      const daily = {
        ...base,
        schedule: { kind: "daily", localTime: "09:15:30" },
        action: { kind: "notify", onlyNewVersion: true },
      } satisfies RenewedPatchReservation;
      const beforeSpringForward = new Date(2026, 2, 7, 23, 30, 0);
      const next = getNextRecurringOccurrence(daily, beforeSpringForward);

      expect(next?.getFullYear()).toBe(2026);
      expect(next?.getMonth()).toBe(2);
      expect(next?.getDate()).toBe(8);
      expect(next?.getHours()).toBe(9);
      expect(next?.getMinutes()).toBe(15);
      expect(next?.getSeconds()).toBe(30);
    } finally {
      if (previousTimeZone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = previousTimeZone;
      }
    }
  });

  it("validates only permitted schedule and action combinations", () => {
    expect(
      isRenewedPatchReservation({
        ...base,
        schedule: {
          kind: "once-range",
          startsAt: "2026-07-25T00:00:00.000Z",
          endsAt: "2026-07-25T01:00:00.000Z",
          intervalMinutes: 1,
        },
        action: { kind: "auto-update", launchAfterUpdate: true },
      }),
    ).toBe(true);
    expect(
      isRenewedPatchReservation({
        ...base,
        id: "   ",
        schedule: { kind: "daily", localTime: "09:00:00" },
        action: { kind: "notify", onlyNewVersion: true },
      }),
    ).toBe(false);
    expect(
      isRenewedPatchReservation({
        ...base,
        schedule: { kind: "daily", localTime: "09:00:00" },
        action: { kind: "auto-update", launchAfterUpdate: true },
      }),
    ).toBe(false);
    expect(
      isRenewedPatchReservation({
        ...base,
        schedule: { kind: "once-at", at: "2026-07-25T01:00:00.000Z" },
        action: { kind: "notify", onlyNewVersion: true },
      }),
    ).toBe(false);
  });
});
