import { EventNotificationService } from "./EventNotificationService";
import { LogWatcher } from "./LogWatcher";
import { PatchReservationService } from "./PatchReservationService";
import { ProcessWatcher } from "./ProcessWatcher";
import { serviceManager } from "./ServiceManager";
import { themeCacheManager } from "./ThemeCacheManager";
import { UpdateSchedulerService } from "./UpdateSchedulerService";

import type { AppContext } from "../events/types";

export function registerCoreServices(appContext: AppContext) {
  serviceManager.register(themeCacheManager);
  serviceManager.register(new ProcessWatcher(appContext));
  serviceManager.register(new LogWatcher(appContext));
  serviceManager.register(new PatchReservationService(appContext));
  serviceManager.register(new UpdateSchedulerService(appContext));
  serviceManager.register(new EventNotificationService(appContext));
}

export async function initializeCoreServices(appContext: AppContext) {
  registerCoreServices(appContext);
  await serviceManager.initAll();

  return {
    processWatcher: getProcessWatcher(),
  };
}

export function getProcessWatcher() {
  return serviceManager.get<ProcessWatcher>("ProcessWatcher");
}

export function getPatchReservationService() {
  return serviceManager.get<PatchReservationService>("PatchReservationService");
}
