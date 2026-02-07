import { AutoLaunchFeature } from "./features/auto-launch";
import { DaumGameStarterFeature } from "./features/daum-game-starter";
import { UacManager } from "./manager";

// Register features to break circular dependency
UacManager.register("AutoLaunch", AutoLaunchFeature);
UacManager.register("DaumGameStarter", DaumGameStarterFeature);

export * from "./types";
export * from "./manager";
export { AutoLaunchFeature } from "./features/auto-launch";
export { DaumGameStarterFeature } from "./features/daum-game-starter";
