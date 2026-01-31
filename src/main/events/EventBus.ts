import { AppContext, AppEvent, EventHandler, EventType } from "./types";
import { Logger } from "../utils/logger";

class EventBus {
  private context: AppContext | null = null;

  public setContext(context: AppContext) {
    this.context = context;
  }

  private logger = new Logger({ type: "EVENT_BUS", typeColor: "#dcdcaa" });

  // Store handlers as generic handlers
  private handlers: Map<EventType, EventHandler<AppEvent>[]> = new Map();

  private log(message: string, ...args: unknown[]) {
    // Only print to real console in dev
    if (process.env.VITE_DEV_SERVER_URL) {
      this.logger.log(message, ...args);
    }
  }

  /**
   * Registers a handler for a specific event type.
   * @param handler The handler instance to register.
   */
  public register<T extends AppEvent>(handler: EventHandler<T>) {
    // Note: This matches existing logic, just collapsing for replaced block context
    const eventType = handler.targetEvent;
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    // Prevent duplicate registration by ID
    const handlersList = this.handlers.get(eventType)!;
    if (handlersList.some((h) => h.id === handler.id)) {
      this.log(
        `[Warning] Handler already registered: ${handler.id} for event ${eventType}. Skipping.`,
      );
      return;
    }

    handlersList.push(handler as unknown as EventHandler<AppEvent>);

    this.log(
      `Registered handler for event: ${eventType} (Handler: ${handler.id})`,
    );
  }

  /**
   * Registers a simple callback for a specific event type.
   * Useful for services that don't need full EventHandler structure.
   */
  public on<T extends AppEvent>(
    type: T["type"],
    callback: (event: T) => void,
  ): void {
    const handler: EventHandler<T> = {
      id: `anonymous_${type}_${Date.now()}_${Math.random()}`,
      targetEvent: type,
      handle: async (event: T) => {
        callback(event);
      },
    };
    this.register(handler);
  }

  /**
   * Removes a simple callback or handler.
   * Note: Currently basic implementation, removing specific anonymous handlers is hard without ID.
   * For now, this is a placeholder or requires storing the wrapper.
   * Better to use full Handler class if unregistration is needed properly.
   */
  public off(type: EventType, handlerId: string) {
    if (!this.handlers.has(type)) return;
    const list = this.handlers.get(type)!;
    const index = list.findIndex((h) => h.id === handlerId);
    if (index !== -1) {
      list.splice(index, 1);
      this.log(`Unregistered handler: ${handlerId}`);
    }
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
