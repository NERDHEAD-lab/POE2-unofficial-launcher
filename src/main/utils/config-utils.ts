import { AppConfig } from "../../shared/types";
import { ContextProvider } from "../context-provider";
import { eventBus } from "../events/EventBus";
import { EventType } from "../events/types";
/* eslint-disable no-restricted-imports */
import {
  setConfig as storeSetConfig,
  deleteConfig as storeDeleteConfig,
} from "../store";
/* eslint-enable no-restricted-imports */

/**
 * Sets a configuration value and broadcasts the change event via EventBus.
 */
export function setConfigWithEvent(key: string, value: unknown) {
  const context = ContextProvider.get();
  let oldValue: unknown = undefined;

  if (context) {
    const currentConfig = context.getConfig() as AppConfig;
    oldValue = currentConfig[key as keyof AppConfig];
  }

  // Update Store
  storeSetConfig(key, value);

  // Broadcast Event
  if (context) {
    eventBus.emit(EventType.CONFIG_CHANGE, context, {
      key,
      oldValue,
      newValue: value,
    });
  }
}

/**
 * Deletes a configuration value and broadcasts the delete event.
 */
export function deleteConfigWithEvent(key: string) {
  const context = ContextProvider.get();
  let oldValue: unknown = undefined;

  if (context) {
    const currentConfig = context.getConfig() as AppConfig;
    oldValue = currentConfig[key as keyof AppConfig];
  }

  // Update Store
  storeDeleteConfig(key);

  // Broadcast Event
  if (context) {
    eventBus.emit(EventType.CONFIG_DELETE, context, {
      key,
      oldValue,
    });
  }
}
