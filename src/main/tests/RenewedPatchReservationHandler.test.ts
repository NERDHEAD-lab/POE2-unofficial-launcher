import { describe, expect, it, vi } from "vitest";

import {
  RenewedPatchReservationCreateHandler,
  RenewedPatchReservationDeleteHandler,
} from "../events/handlers/RenewedPatchReservationHandler";
import { EventType } from "../events/types";

import type { RenewedPatchReservation } from "../../shared/types";
import type {
  AppContext,
  RenewedPatchReservationCreateEvent,
  RenewedPatchReservationDeleteEvent,
} from "../events/types";

vi.mock("../services/PatchReservationService", () => ({
  PatchReservationService: class {},
}));

const reservation = {
  id: "renewed-command",
  gameId: "POE2",
  serviceId: "Kakao Games",
  createdAt: "2026-07-25T00:00:00.000Z",
  schedule: { kind: "daily", localTime: "03:00:00" },
  action: { kind: "notify", onlyNewVersion: true },
} satisfies RenewedPatchReservation;

describe("renewed patch reservation EventBus handlers", () => {
  it("delegates create and returns the service result", async () => {
    const addRenewedReservation = vi.fn(() => ({ ok: true }) as const);
    const context = {
      serviceManager: {
        get: vi.fn(() => ({ addRenewedReservation })),
      },
    } as unknown as AppContext;
    const result: RenewedPatchReservationCreateEvent["payload"]["result"] = {
      value: { ok: false, reason: "service-unavailable" },
    };

    await RenewedPatchReservationCreateHandler.handle(
      {
        type: EventType.RENEWED_PATCH_RESERVATION_CREATE,
        payload: { reservation, result },
      },
      context,
    );

    expect(addRenewedReservation).toHaveBeenCalledWith(reservation);
    expect(result.value).toEqual({ ok: true });
  });

  it("fails closed when the service is unavailable", async () => {
    const context = {
      serviceManager: { get: vi.fn(() => undefined) },
    } as unknown as AppContext;
    const result: RenewedPatchReservationDeleteEvent["payload"]["result"] = {
      value: { ok: true },
    };

    await RenewedPatchReservationDeleteHandler.handle(
      {
        type: EventType.RENEWED_PATCH_RESERVATION_DELETE,
        payload: { id: reservation.id, result },
      },
      context,
    );

    expect(result.value).toEqual({
      ok: false,
      reason: "service-unavailable",
    });
  });
});
