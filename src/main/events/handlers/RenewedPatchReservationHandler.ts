import { PatchReservationService } from "../../services/PatchReservationService";
import { EventType } from "../types";

import type {
  EventHandler,
  RenewedPatchReservationCreateEvent,
  RenewedPatchReservationDeleteEvent,
} from "../types";

const getService = (context: Parameters<EventHandler["handle"]>[1]) =>
  context.serviceManager.get<PatchReservationService>(
    "PatchReservationService",
  );

export const RenewedPatchReservationCreateHandler: EventHandler<RenewedPatchReservationCreateEvent> =
  {
    id: "RenewedPatchReservationCreateHandler",
    targetEvent: EventType.RENEWED_PATCH_RESERVATION_CREATE,
    handle: async (event, context) => {
      event.payload.result.value = getService(context)?.addRenewedReservation(
        event.payload.reservation,
      ) ?? { ok: false, reason: "service-unavailable" };
    },
  };

export const RenewedPatchReservationDeleteHandler: EventHandler<RenewedPatchReservationDeleteEvent> =
  {
    id: "RenewedPatchReservationDeleteHandler",
    targetEvent: EventType.RENEWED_PATCH_RESERVATION_DELETE,
    handle: async (event, context) => {
      event.payload.result.value = getService(
        context,
      )?.deleteRenewedReservation(event.payload.id) ?? {
        ok: false,
        reason: "service-unavailable",
      };
    },
  };
