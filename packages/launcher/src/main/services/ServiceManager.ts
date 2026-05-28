import { IService, IServiceManager } from "../events/types";
import { logger } from "../utils/logger";

export class ServiceManager implements IServiceManager {
  private services: Map<string, IService> = new Map();

  /**
   * Register a service.
   */
  public register(service: IService): void {
    if (this.services.has(service.id)) {
      logger.warn(
        `[ServiceManager] Service with ID '${service.id}' is already registered. Overwriting.`,
      );
    }
    this.services.set(service.id, service);
    logger.log(`[ServiceManager] Service registered: ${service.id}`);
  }

  /**
   * Get a registered service by ID.
   */
  public get<T extends IService>(id: string): T | undefined {
    return this.services.get(id) as T | undefined;
  }

  /**
   * Initializes all registered services.
   */
  public async initAll(): Promise<void> {
    logger.log("[ServiceManager] Initializing all services...");
    for (const service of this.services.values()) {
      if (service.init) {
        try {
          await service.init();
          logger.log(`[ServiceManager] Service initialized: ${service.id}`);
        } catch (error) {
          logger.error(
            `[ServiceManager] Failed to initialize service '${service.id}':`,
            error,
          );
        }
      }
    }
  }

  /**
   * Stops all registered services in reverse registration order.
   */
  public async stopAll(): Promise<void> {
    logger.log("[ServiceManager] Stopping all services...");

    // Stop in reverse order of registration to handle dependencies correctly
    const serviceList = Array.from(this.services.values()).reverse();

    for (const service of serviceList) {
      try {
        await service.stop();
        logger.log(`[ServiceManager] Service stopped: ${service.id}`);
      } catch (error) {
        logger.error(
          `[ServiceManager] Failed to stop service '${service.id}':`,
          error,
        );
      }
    }
  }
}

// Export a singleton instance if needed, or instantiate in main.ts
export const serviceManager = new ServiceManager();
