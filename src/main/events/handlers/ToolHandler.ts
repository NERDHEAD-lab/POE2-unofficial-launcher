import { PatchManager } from "../../services/PatchManager";
import { eventBus } from "../EventBus";
import { AppContext, DebugLogEvent, EventHandler, EventType } from "../types";

// --- Helper for UI Logging ---
function emitLog(
  context: AppContext,
  content: string,
  isError: boolean = false,
) {
  eventBus.emit<DebugLogEvent>(EventType.DEBUG_LOG, context, {
    type: "tool",
    content,
    isError,
    timestamp: Date.now(),
    typeColor: "#ce9178", // Orange/Reddish for Tool Action
    textColor: isError ? "#f48771" : "#d4d4d4",
  });
}

export const ToolForceRepairHandler: EventHandler<
  import("../types").ToolForceRepairEvent
> = {
  id: "ToolForceRepairHandler",
  targetEvent: EventType.TOOL_FORCE_REPAIR,
  handle: async (event, context) => {
    const { installPath, serviceId, webRoot } = event.payload;

    emitLog(
      context,
      `[Tool] Executing Force Repair for ${serviceId} (WebRoot: ${webRoot})...`,
    );

    // Instantiate a fresh PatchManager for this tool action
    // We don't share state with AutoPatchHandler as this is an explicit user action
    const manager = new PatchManager(context);

    try {
      const success = await manager.forceRestoration(
        installPath,
        serviceId,
        webRoot,
      );

      if (success) {
        emitLog(context, `[Tool] Force Repair Completed Successfully.`);
      } else {
        emitLog(context, `[Tool] Force Repair Failed.`, true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      emitLog(context, `[Tool] Force Repair Exception: ${msg}`, true);
    }
  },
};
