import type { AppConfig } from "../../shared/types";

type GamePathModalIdentity = {
  serviceId: AppConfig["serviceChannel"];
  gameId: AppConfig["activeGame"];
};

export const updateGamePathModalForContext = <
  State extends GamePathModalIdentity,
>(
  current: State | null,
  serviceId: AppConfig["serviceChannel"],
  gameId: AppConfig["activeGame"],
  update: (matched: State) => State,
): State | null => {
  if (
    !current ||
    current.serviceId !== serviceId ||
    current.gameId !== gameId
  ) {
    return current;
  }

  return update(current);
};
