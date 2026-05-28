import { app } from "electron";

import { triggerUpdateCheck } from "../events/handlers/UpdateHandler";
import { AppContext, IService } from "../events/types";
import { logger } from "../utils/logger";

export class UpdateSchedulerService implements IService {
  public readonly id = "UpdateSchedulerService";
  private intervalId: NodeJS.Timeout | null = null;
  private readonly INTERVAL = 1000 * 60 * 60 * 4; // 4 hours

  constructor(private context: AppContext) {}

  public async init(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    logger.log(
      "[UpdateSchedulerService] Starting background update scheduler.",
    );

    this.intervalId = setInterval(async () => {
      if (!app.isPackaged || process.env.VITE_DEV_SERVER_URL) {
        return;
      }

      logger.log("[UpdateSchedulerService] Background update check triggered.");
      await triggerUpdateCheck(this.context, true);
    }, this.INTERVAL);
  }

  public async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.log(
        "[UpdateSchedulerService] Background update scheduler stopped.",
      );
    }
  }
}
