import { isRenewedPatchReservation } from "../../shared/patch-reservation";
import { eventBus } from "../events/EventBus";
import {
  EventType,
  type AppContext,
  type RenewedPatchReservationCreateEvent,
  type RenewedPatchReservationDeleteEvent,
} from "../events/types";
import { logger } from "../utils/logger";

import type { RenewedPatchReservationCommandResult } from "../../shared/types";

export const createRenewedPatchReservation = async (
  context: AppContext | null,
  reservation: unknown,
): Promise<RenewedPatchReservationCommandResult> => {
  if (!isRenewedPatchReservation(reservation)) {
    logger.warn("[Main] Rejected invalid renewed patch reservation payload.");
    return { ok: false, reason: "invalid" };
  }
  if (!context) {
    return { ok: false, reason: "service-unavailable" };
  }

  logger.log(
    `[Main] Renewed Patch Reservation added: ${reservation.gameId} / ${reservation.schedule.kind}`,
  );
  const result: RenewedPatchReservationCreateEvent["payload"]["result"] = {
    value: { ok: false, reason: "service-unavailable" },
  };
  await eventBus.emit<RenewedPatchReservationCreateEvent>(
    EventType.RENEWED_PATCH_RESERVATION_CREATE,
    context,
    { reservation, result },
  );
  return result.value;
};

export const deleteRenewedPatchReservation = async (
  context: AppContext | null,
  id: unknown,
): Promise<RenewedPatchReservationCommandResult> => {
  if (typeof id !== "string" || id.length === 0) {
    logger.warn(
      "[Main] Rejected invalid renewed patch reservation delete payload.",
    );
    return { ok: false, reason: "invalid" };
  }
  if (!context) {
    return { ok: false, reason: "service-unavailable" };
  }

  logger.log(`[Main] Renewed Patch Reservation deleted: ${id}`);
  const result: RenewedPatchReservationDeleteEvent["payload"]["result"] = {
    value: { ok: false, reason: "service-unavailable" },
  };
  await eventBus.emit<RenewedPatchReservationDeleteEvent>(
    EventType.RENEWED_PATCH_RESERVATION_DELETE,
    context,
    { id, result },
  );
  return result.value;
};
