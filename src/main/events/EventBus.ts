import { AppContext, AppEvent, EventHandler, EventType } from "./types";

class EventBus {
  private handlers: Map<EventType, EventHandler[]> = new Map();

  /**
   * Register a new event handler
   */
  public register(handler: EventHandler) {
    if (!this.handlers.has(handler.targetEvent)) {
      this.handlers.set(handler.targetEvent, []);
    }
    this.handlers.get(handler.targetEvent)?.push(handler);
    console.log(
      `[EventBus] Registered Handler: ${handler.id} for ${handler.targetEvent}`,
    );
  }

  /**
   * Emit an event and execute matching handlers
   */
  public async emit(type: EventType, context: AppContext, payload?: unknown) {
    const event: AppEvent = {
      type,
      payload,
      timestamp: Date.now(),
    };

    console.log(`[EventBus] Emitting Event: ${type}`);

    const handlers = this.handlers.get(type) || [];
    const executionPromises = handlers.map(async (handler) => {
      try {
        // Check condition if it exists
        if (handler.condition && !handler.condition(context)) {
          // Silently skip if condition not met (or log if verbose)
          return;
        }

        console.log(`[EventBus] Executing Handler: ${handler.id}`);
        await handler.handle(event, context);
      } catch (error) {
        console.error(`[EventBus] Error in Handler ${handler.id}:`, error);
      }
    });

    await Promise.all(executionPromises);
  }
}

// Export Singleton Instance
export const eventBus = new EventBus();
