import React, { useState, useRef, useEffect, useCallback } from "react";
import "./GameSelector.css";

// Import Assets
import logoPoe from "../assets/poe/logo.png";
import logoPoe2 from "../assets/poe2/logo.png";

interface GameSelectorProps {
  activeGame: "POE1" | "POE2";
  onGameChange: (game: "POE1" | "POE2") => void;
}

type InteractionState =
  | "IDLE"
  | "DRAGGING"
  | "THROWING"
  | "SNAPPING"
  | "ANIMATING";

// --- Helper: State Logger ---
// (Moved outside to keep component clean)
const logStateChange = (
  oldState: InteractionState,
  newState: InteractionState,
) => {
  if (oldState !== newState) {
    console.log(`[FSM] ${oldState} -> ${newState}`);
  }
};

// --- Physics Configuration (Tuning) ---
const PHYSICS_CONFIG = {
  FRICTION: 0.99, // Deceleration (0.0~1.0): Closer to 1 = Slides longer
  MAX_VELOCITY: 0.45, // Max Spin Speed Cap (Prevents too many spins)
  DRAG_SENSITIVITY: 0.003, // Mouse Sensitivity
  SNAP_STRENGTH: 0.08, // Magnet Strength
  SNAP_THRESHOLD: 0.002, // Speed below which snapping starts
};

// --- Module 1: Visual State Calculation ---
const getVisualState = (cyclicPhase: number, isPoe1: boolean) => {
  const p = Math.max(-0.2, Math.min(1.2, cyclicPhase));
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  if (isPoe1) {
    return {
      left: lerp(20, 140, p),
      scale: lerp(1.0, 0.65, p),
      opacity: lerp(1, 0.6, p),
      zIndex: p < 0.5 ? 10 : 1,
      grayscale: lerp(0, 100, p),
      brightness: lerp(1, 0.5, p),
    };
  } else {
    return {
      left: lerp(160, 20, p),
      scale: lerp(0.65, 1.0, p),
      opacity: lerp(0.6, 1, p),
      zIndex: p > 0.5 ? 10 : 1,
      grayscale: lerp(100, 0, p),
      brightness: lerp(0.5, 1, p),
    };
  }
};

const GameSelector: React.FC<GameSelectorProps> = ({
  activeGame,
  onGameChange,
}) => {
  // --- Refs & State ---
  const [renderPhase, setRenderPhase] = useState(activeGame === "POE1" ? 0 : 1);
  const [isAnimating, setIsAnimating] = useState(false);

  const stateRef = useRef<InteractionState>("IDLE");
  const phaseRef = useRef(activeGame === "POE1" ? 0 : 1);
  const velocityRef = useRef(0);
  const lastXRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);

  // --- Helper: Triangle Wave ---
  const getCyclicPhase = (raw: number) => {
    const positiveP = Math.abs(raw);
    const mod = positiveP % 2;
    return 1 - Math.abs(mod - 1);
  };

  // --- Wrapper for state logging ---
  const changeState = (newState: InteractionState) => {
    logStateChange(stateRef.current, newState);
    stateRef.current = newState;
  };

  // --- FSM Physics Loop ---
  const loopRef = useRef<(time: number) => void>();

  const updatePhysics = useCallback(
    (time: number) => {
      let vel = velocityRef.current;
      let pos = phaseRef.current;

      switch (stateRef.current) {
        case "DRAGGING":
          // Handled by MouseMove
          break;

        case "THROWING": {
          pos += vel;
          vel *= PHYSICS_CONFIG.FRICTION;

          if (Math.abs(vel) < PHYSICS_CONFIG.SNAP_THRESHOLD) {
            changeState("SNAPPING");
          }
          break;
        }

        case "SNAPPING": {
          const target = Math.round(pos);
          const dist = target - pos;

          vel += dist * PHYSICS_CONFIG.SNAP_STRENGTH;
          vel *= 0.85;
          pos += vel;

          if (Math.abs(dist) < 0.001 && Math.abs(vel) < 0.001) {
            pos = target;
            vel = 0;
            changeState("IDLE");

            const isEven = Math.abs(Math.round(pos)) % 2 === 0;
            const finalGame = isEven ? "POE1" : "POE2";
            if (finalGame !== activeGame) {
              onGameChange(finalGame);
            }
          }
          break;
        }

        case "IDLE":
        case "ANIMATING":
          rafIdRef.current = null;
          return;
      }

      phaseRef.current = pos;
      velocityRef.current = vel;
      setRenderPhase(getCyclicPhase(pos));

      if (loopRef.current) {
        rafIdRef.current = requestAnimationFrame(loopRef.current);
      }
    },
    [activeGame, onGameChange],
  ); // PHYSICS_CONFIG is now static, no dep needed

  useEffect(() => {
    loopRef.current = updatePhysics;
  }, [updatePhysics]);

  const startLoop = () => {
    if (!rafIdRef.current && loopRef.current) {
      rafIdRef.current = requestAnimationFrame(loopRef.current);
    }
  };

  // --- Interaction Handlers ---
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsAnimating(false);
    changeState("DRAGGING");
    lastXRef.current = e.clientX;
    velocityRef.current = 0;
    startLoop();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (stateRef.current !== "DRAGGING") return;

      const deltaX = e.clientX - lastXRef.current;
      lastXRef.current = e.clientX;

      let phaseDelta = -deltaX * PHYSICS_CONFIG.DRAG_SENSITIVITY;

      // Clamp Max Velocity
      if (Math.abs(phaseDelta) > PHYSICS_CONFIG.MAX_VELOCITY) {
        phaseDelta = Math.sign(phaseDelta) * PHYSICS_CONFIG.MAX_VELOCITY;
      }

      phaseRef.current += phaseDelta;
      velocityRef.current = phaseDelta;
    };

    const handleMouseUp = () => {
      if (stateRef.current !== "DRAGGING") return;
      changeState("THROWING");
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const propsUpdateRef = useRef(activeGame);
  useEffect(() => {
    if (propsUpdateRef.current !== activeGame) {
      propsUpdateRef.current = activeGame;
      const isTargetPoe1 = activeGame === "POE1";

      let newPhase = Math.round(phaseRef.current);
      const isCurrentEven = Math.abs(newPhase) % 2 === 0;

      if (isCurrentEven !== isTargetPoe1) {
        newPhase += 1;
      }

      requestAnimationFrame(() => {
        setIsAnimating(true);
        setRenderPhase(getCyclicPhase(newPhase));
        phaseRef.current = newPhase;
        velocityRef.current = 0;
        changeState("ANIMATING");
      });
    }
  }, [activeGame]);

  const handleClick = (e: React.MouseEvent, targetGame: "POE1" | "POE2") => {
    e.stopPropagation();
    if (Math.abs(velocityRef.current) > 0.005) return;

    if (activeGame !== targetGame) {
      const current = phaseRef.current;
      let target = Math.round(current);

      const isTargetEven = target % 2 === 0;
      const wantEven = targetGame === "POE1";

      if (isTargetEven !== wantEven) {
        target += 1;
      }

      setIsAnimating(true);
      setRenderPhase(getCyclicPhase(target));
      phaseRef.current = target;
      velocityRef.current = 0;
      changeState("ANIMATING");

      onGameChange(targetGame);
    }
  };

  const p = renderPhase;
  const poe1 = getVisualState(p, true);
  const poe2 = getVisualState(p, false);

  const createStyle = (visuals: ReturnType<typeof getVisualState>) => ({
    left: `${visuals.left}px`,
    transform: `scale(${visuals.scale}) translateZ(0)`,
    transformOrigin: "top center",
    opacity: visuals.opacity,
    zIndex: visuals.zIndex,
    filter: `grayscale(${visuals.grayscale}%) brightness(${visuals.brightness}) drop-shadow(0 4px 6px rgba(0,0,0,0.5))`,
    transition: isAnimating
      ? "all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)"
      : "none",
  });

  return (
    <div className="logo-container" onMouseDown={handleMouseDown}>
      <img
        src={logoPoe}
        className="logo-item"
        alt="POE Logo"
        style={createStyle(poe1)}
        onClick={(e) => handleClick(e, "POE1")}
      />
      <img
        src={logoPoe2}
        className="logo-item"
        alt="POE2 Logo"
        style={createStyle(poe2)}
        onClick={(e) => handleClick(e, "POE2")}
      />
    </div>
  );
};

export default GameSelector;
