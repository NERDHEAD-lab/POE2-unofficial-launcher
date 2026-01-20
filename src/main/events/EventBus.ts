import {
  AppContext,
  AppEvent,
  EventHandler,
  EventType,
  DebugLogEvent,
} from "./types";

class EventBus {
  private context: AppContext | null = null;

  public setContext(context: AppContext) {
    this.context = context;
  }
  // Store handlers as generic handlers
  private handlers: Map<EventType, EventHandler<AppEvent>[]> = new Map();

  private log(message: string, ...args: unknown[]) {
    if (process.env.VITE_DEV_SERVER_URL) {
      console.log(`[EventBus] ${message}`, ...args);
    }

    if (this.context) {
      let content = message;
      if (args.length > 0) {
        const formattedArgs = args
          .map((arg) => {
            try {
              return typeof arg === "object"
                ? JSON.stringify(arg, null, 2)
                : String(arg);
            } catch (e) {
              return String(arg);
            }
          })
          .join(" ");
        content = `${message} ${formattedArgs}`;
      }

      // Check if we should suppress known noisy logs (e.g. detailed payloads)
      // For now, we allow everything but could filter if needed

      this.emit<DebugLogEvent>(EventType.DEBUG_LOG, this.context, {
        type: "event_bus",
        content,
        isError: false,
        timestamp: Date.now(),
        typeColor: "#dcdcaa", // Light Yellow for EventBus events
        textColor: "#d4d4d4", // Default text color
      });
    }
  }

  /**
   * Register a new event handler
   */
  public register<T extends AppEvent>(handler: EventHandler<T>) {
    if (!this.handlers.has(handler.targetEvent)) {
      this.handlers.set(handler.targetEvent, []);
    }
    // Safe cast: We map EventType -> EventHandler<T> logically, but store as AppEvent for storage
    this.handlers
      .get(handler.targetEvent)
      ?.push(handler as unknown as EventHandler<AppEvent>);
    this.log(`📝 Registered Handler: ${handler.id} for ${handler.targetEvent}`);
  }

  /**
   * Emit an event and execute matching handlers
   * We use T extends AppEvent to try to enforce type safety,
   * but typically inference works best if we pass the whole event or strict arguments.
   */
  public async emit<T extends AppEvent>(
    type: T["type"],
    context: AppContext,
    payload: T["payload"],
  ) {
    // Construct the event object (Casting to T because we know the structure matches)
    const event = {
      type,
      payload,
      timestamp: Date.now(),
    } as T;

    // Check if we should suppress log for this event type
    // We suppress DEBUG_LOG emit logs to prevent terminal spam
    if (type !== EventType.DEBUG_LOG) {
      this.log(`📢 Emit: ${type}`, payload ? payload : "");
    }

    const handlers = this.handlers.get(type) || [];
    const executionPromises = handlers.map(async (handler) => {
      try {
        // Validation: condition check
        if (handler.condition && !handler.condition(event, context)) {
          return;
        }

        // Log execution only if not suppressed
        if (handler.debug !== false) {
          this.log(`👉 Executing Handler: ${handler.id}`);
        }

        // Safe validation: We registered usage based on targetEvent, so handler expects T
        await handler.handle(event, context);
      } catch (error) {
        console.error(`[EventBus] ❌ Error in Handler ${handler.id}:`, error);
      }
    });

    await Promise.all(executionPromises);
  }
}

// Export Singleton Instance
export const eventBus = new EventBus();
