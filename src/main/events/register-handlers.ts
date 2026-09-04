import { eventBus } from "./EventBus";
import { AutoLaunchHandler } from "./handlers/AutoLaunchHandler";
import {
  AutoPatchProcessStopHandler,
  AutoPatchProcessStartHandler,
  LogErrorHandler,
  LogSessionHandler,
  LogWebRootHandler,
  PatchProgressHandler,
  ProcessWillTerminateHandler,
} from "./handlers/AutoPatchHandler";
import { ChangelogCheckHandler } from "./handlers/ChangelogCheckHandler";
import { ChangelogUISyncHandler } from "./handlers/ChangelogUISyncHandler";
import { CleanupLauncherWindowHandler } from "./handlers/CleanupLauncherWindowHandler";
import {
  ConfigChangeSyncHandler,
  ConfigDeleteSyncHandler,
} from "./handlers/ConfigSyncHandler";
import { DebugLogHandler } from "./handlers/DebugLogHandler";
import { DevToolsVisibilityHandler } from "./handlers/DevToolsVisibilityHandler";
import {
  EventNotificationDismissHandler,
  EventNotificationSettingsHandler,
  EventNotificationSettingsDeleteHandler,
  EventNotificationUISyncHandler,
} from "./handlers/EventNotificationHandler";
import { GameInstallCheckHandler } from "./handlers/GameInstallCheckHandler";
import {
  GameProcessStartHandler,
  GameProcessStopHandler,
} from "./handlers/GameProcessStatusHandler";
import { GameStatusSyncHandler } from "./handlers/GameStatusSyncHandler";
import { InactiveWindowVisibilityHandler } from "./handlers/InactiveWindowVisibilityHandler";
import { KakaoMaintenanceUISyncHandler } from "./handlers/KakaoMaintenanceUISyncHandler";
import {
  RenewedPatchReservationCreateHandler,
  RenewedPatchReservationDeleteHandler,
} from "./handlers/RenewedPatchReservationHandler";
import { StartPoe1KakaoHandler } from "./handlers/StartPoe1KakaoHandler";
import { StartPoe2KakaoHandler } from "./handlers/StartPoe2KakaoHandler";
import { StartPoeGggHandler } from "./handlers/StartPoeGggHandler";
import { SystemWakeUpHandler } from "./handlers/SystemWakeUpHandler";
import { UacHandler } from "./handlers/UacHandler";
import {
  UpdateCheckHandler,
  UpdateDownloadHandler,
  UpdateInstallHandler,
} from "./handlers/UpdateHandler";

import type { AppEvent, EventHandler } from "./types";

export const CORE_EVENT_HANDLERS = [
  DebugLogHandler,
  ConfigChangeSyncHandler,
  ConfigDeleteSyncHandler,
  StartPoe1KakaoHandler,
  StartPoe2KakaoHandler,
  StartPoeGggHandler,
  CleanupLauncherWindowHandler,
  GameStatusSyncHandler,
  GameProcessStartHandler,
  GameProcessStopHandler,
  GameInstallCheckHandler,
  SystemWakeUpHandler,
  UpdateCheckHandler,
  UpdateDownloadHandler,
  UpdateInstallHandler,
  AutoPatchProcessStartHandler,
  LogSessionHandler,
  LogWebRootHandler,
  LogErrorHandler,
  AutoPatchProcessStopHandler,
  PatchProgressHandler,
  AutoLaunchHandler,
  ProcessWillTerminateHandler,
  DevToolsVisibilityHandler,
  ChangelogCheckHandler,
  ChangelogUISyncHandler,
  UacHandler,
  InactiveWindowVisibilityHandler,
  KakaoMaintenanceUISyncHandler,
  RenewedPatchReservationCreateHandler,
  RenewedPatchReservationDeleteHandler,
  EventNotificationSettingsHandler,
  EventNotificationSettingsDeleteHandler,
  EventNotificationUISyncHandler,
  EventNotificationDismissHandler,
] as const;

export function registerCoreEventHandlers() {
  CORE_EVENT_HANDLERS.forEach((handler) => {
    eventBus.register(handler as EventHandler<AppEvent>);
  });
}
