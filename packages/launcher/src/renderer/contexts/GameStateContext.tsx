/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";

import { GameStatusState } from "@poe2-launcher/shared/types";

interface GameStateContextValue {
  gameStatusMap: Record<string, GameStatusState>;
  getActiveGameState: (gameId: string, serviceId: string) => GameStatusState;
  syncGameState: (gameId: string, serviceId: string) => Promise<void>;
}

export const GameStateContext = createContext<GameStateContextValue | null>(
  null,
);

export function GameStateProvider({ children }: { children: ReactNode }) {
  const [gameStatusMap, setGameStatusMap] = useState<
    Record<string, GameStatusState>
  >({});

  // Listen to remote changes
  useEffect(() => {
    if (window.electronAPI?.onGameStatusUpdate) {
      const cleanup = window.electronAPI.onGameStatusUpdate((statusState) => {
        setGameStatusMap((prev) => ({
          ...prev,
          [`${statusState.gameId}_${statusState.serviceId}`]: statusState,
        }));
      });
      return cleanup;
    }
  }, []);

  // Sync initial state on demand
  const syncGameState = useCallback(
    async (gameId: string, serviceId: string) => {
      if (window.electronAPI?.getGameStatus) {
        try {
          const status = await window.electronAPI.getGameStatus(
            gameId,
            serviceId,
          );
          setGameStatusMap((prev) => ({
            ...prev,
            [`${gameId}_${serviceId}`]: status,
          }));
        } catch (error) {
          console.error("Failed to sync game state:", error);
        }
      }
    },
    [],
  );

  const getActiveGameState = useCallback(
    (gameId: string, serviceId: string) => {
      return (
        gameStatusMap[`${gameId}_${serviceId}`] || {
          gameId,
          serviceId,
          status: "idle",
        }
      );
    },
    [gameStatusMap],
  );

  return (
    <GameStateContext.Provider
      value={{ gameStatusMap, getActiveGameState, syncGameState }}
    >
      {children}
    </GameStateContext.Provider>
  );
}

export function useGameState() {
  const context = useContext(GameStateContext);
  if (!context) {
    throw new Error("useGameState must be used within GameStateProvider");
  }
  return context;
}
