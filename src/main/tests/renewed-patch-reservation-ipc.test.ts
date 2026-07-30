import { beforeEach, describe, expect, it, vi } from "vitest";

import { eventBus } from "../events/EventBus";
import { EventType } from "../events/types";
import {
  createRenewedPatchReservation,
  deleteRenewedPatchReservation,
} from "../ipc/renewed-patch-reservation-ipc";
import { logger } from "../utils/logger";

import type { RenewedPatchReservation } from "../../shared/types";
import type { AppContext } from "../events/types";

vi.mock("../events/EventBus", () => ({
  eventBus: {
    emit: vi.fn(),
  },
}));

vi.mock("../utils/logger", () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
  },
}));

const context = {} as AppContext;
const reservation = {
  id: "renewed-ipc",
  gameId: "POE1",
  serviceId: "Kakao Games",
  createdAt: "2099-07-25T00:00:00.000Z",
  schedule: {
    kind: "once-at",
    at: "2099-07-25T01:00:00.000Z",
  },
  action: { kind: "notify" },
} satisfies RenewedPatchReservation;

describe("renewed patch reservation IPC validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(eventBus.emit).mockImplementation(
      async (_type, _context, data) => {
        (
          data as {
            result: {
              value: { ok: true };
            };
          }
        ).result.value = { ok: true };
      },
    );
  });

  it.each([null, [], { gameId: "POE1" }, { ...reservation, id: "   " }])(
    "rejects malformed create payloads before EventBus dispatch",
    async (payload) => {
      await expect(
        createRenewedPatchReservation(context, payload),
      ).resolves.toEqual({ ok: false, reason: "invalid" });
      expect(eventBus.emit).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    },
  );

  it("dispatches a fully validated create request", async () => {
    await expect(
      createRenewedPatchReservation(context, reservation),
    ).resolves.toEqual({ ok: true });
    expect(eventBus.emit).toHaveBeenCalledWith(
      EventType.RENEWED_PATCH_RESERVATION_CREATE,
      context,
      expect.objectContaining({ reservation }),
    );
  });

  it.each([null, [], ""])(
    "rejects malformed delete payloads before EventBus dispatch",
    async (payload) => {
      await expect(
        deleteRenewedPatchReservation(context, payload),
      ).resolves.toEqual({ ok: false, reason: "invalid" });
      expect(eventBus.emit).not.toHaveBeenCalled();
    },
  );
});
