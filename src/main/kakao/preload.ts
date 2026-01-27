import { ipcRenderer } from "electron";

import { AppConfig } from "../../shared/types";

// --- Interfaces ---

interface GameSessionContext {
  gameId: AppConfig["activeGame"];
  serviceId: AppConfig["serviceChannel"];
}

interface PageHandler {
  name: string;
  description: string;
  /** Condition to activate this handler */
  match: (url: URL) => boolean;
  /** Main logic execution */
  execute: () => Promise<void> | void;
}

// --- DOM Selectors ---

const SELECTORS = {
  POE2: {
    MODAL_CONTAINER: ".modal__container",
    INTRO_MODAL_ID: "kgIntroModalContents",
    BTN_TODAY_CLOSE: ".modal__button-block",
    BTN_CLOSE_X: ".modal__button-x",
    BTN_GAME_START: ".main-start__link",
  },
  POE1: {
    // Daum POE1 Main Start Button - Updated from domSelectors.ts
    BTN_GAME_START: "#signupButton",
  },
  LAUNCHER: {
    GAME_START_BUTTONS: [
      ".btn-start-game",
      "span.btn_g",
      ".popup__link--confirm",
    ],
    LOGIN_REQUIRED_TEXTS: ["로그인이 필요한 서비스", "로그인 하시겠습니까"],
    BTN_CONFIRM: ".popup__link--confirm",
  },
  SECURITY: {
    CONFIRM_BUTTONS: [
      "a",
      "button",
      "span.btn_g",
      ".popup__link--confirm",
      ".btn-confirm",
    ],
    BTN_DESIGNATED_CONFIRM: ".btn-confirm",
    BTN_POPUP_CONFIRM: ".popup__link--confirm",
    PC_INFO_BTN_ATTR: '[ganame="PC정보수집안내_확인_버튼"]',
  },
  LOGIN_DAUM: {
    BTN_KAKAO_LOGIN: ".login__container--btn-kakao",
    BTN_KAKAO_LEGACY: ".link_kakao_login",
  },
  KAKAO_AUTH: {
    BTN_AGREE: '.btn_agree, button[type="submit"].btn_g',
  },
  KAKAO_SIMPLE: {
    // Select first account in list (target a[role="button"] for semantic click)
    FIRST_ACCOUNT: ".list_easy li:first-child a[role='button']",
  },
};

// --- Utils ---

function safeClick(element: HTMLElement | null) {
  if (!element) return false;

  try {
    // 1. Handle javascript: protocol
    if (
      element instanceof HTMLAnchorElement &&
      element.href.toLowerCase().startsWith("javascript:")
    ) {
      console.log(
        "[Game Window] Detecting javascript: href, dispatching custom click event.",
      );
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      event.preventDefault();
      element.dispatchEvent(event);
      return true;
    }

    // 2. Native click
    if (typeof element.click === "function") {
      console.log("[Game Window] Performing native .click()");
      element.click();
      return true;
    }

    // 3. Fallback: Dispatch Event
    console.log("[Game Window] Native click not function, dispatching event.");
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    return true;
  } catch (err) {
    console.error("[Game Window] safeClick failed:", err);
    return false;
  }
}

function observeAndInteract(
  checkFn: (obs?: MutationObserver) => boolean,
  timeoutMs: number = 10000,
) {
  if (checkFn()) return;

  console.log(
    "[Game Window] Target not found immediately. Starting observer...",
  );

  const observer = new MutationObserver((_mutations, obs) => {
    if (checkFn(obs)) {
      // Logic handled in checkFn
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  if (timeoutMs > 0) {
    setTimeout(() => {
      observer.disconnect();
      console.log("[Game Window] Observer timed out.");
    }, timeoutMs);
  }
}

// --- Handler Implementations ---

/**
 * POE1 Main Page Handler
 * Matches: poe.game.daum.net (excluding other subdomains if necessary)
 */
const PoeMainHandler: PageHandler = {
  name: "PoeMainHandler",
  description: "POE1 Homepage - Game Start",
  match: (url) => url.hostname === "poe.game.daum.net",
  execute: async () => {
    console.log(`[Handler] Executing ${PoeMainHandler.name}`);
    observeAndInteract((obs) => {
      const startBtn = document.querySelector(SELECTORS.POE1.BTN_GAME_START);
      if (safeClick(startBtn as HTMLElement)) {
        console.log("[PoeMainHandler] Clicked POE1 Start Button");
        if (obs) obs.disconnect();
        return true;
      }
      return false;
    });
  },
};

/**
 * POE2 Main Page Handler
 * Matches: pathofexile2.game.daum.net
 * Handles Intro Modal & Game Start Button
 */
const Poe2MainHandler: PageHandler = {
  name: "Poe2MainHandler",
  description: "POE2 Homepage - Intro Modal & Game Start",
  match: (url) => url.hostname === "pathofexile2.game.daum.net",
  execute: async () => {
    console.log(`[Handler] Executing ${Poe2MainHandler.name}`);

    // 1. Modal Logic (Immediate check, then Observer fallback via runSequence)
    const handleIntroModal = async () => {
      const cookies = document.cookie.split(";").reduce(
        (acc, cookie) => {
          const [name, value] = cookie.trim().split("=");
          acc[name] = value;
          return acc;
        },
        {} as Record<string, string>,
      );

      if (cookies["POE2_INTRO_MODAL"] === "1") {
        console.log("[Poe2MainHandler] Intro Modal cookie present, skipping.");
        return;
      }

      const introContent = document.getElementById(
        SELECTORS.POE2.INTRO_MODAL_ID,
      );
      if (introContent) {
        const container = introContent.closest(SELECTORS.POE2.MODAL_CONTAINER);
        if (container && (container as HTMLElement).offsetParent !== null) {
          const closeBtn = container.querySelector(SELECTORS.POE2.BTN_CLOSE_X);
          const todayBtn = container.querySelector(
            SELECTORS.POE2.BTN_TODAY_CLOSE,
          );

          // Priority: Today Close -> Close X
          if (todayBtn && safeClick(todayBtn as HTMLElement)) {
            console.log('[Poe2MainHandler] Clicked "Today Close"');
          } else if (closeBtn && safeClick(closeBtn as HTMLElement)) {
            console.log('[Poe2MainHandler] Clicked "Close X"');
          }
          await new Promise((r) => setTimeout(r, 500)); // Small delay after close
        }
      }
    };

    // 2. Observer for Button Interactivity
    observeAndInteract((obs) => {
      // Try handling modal first in every mutation cycle if it exists
      handleIntroModal().catch(console.error);

      const startBtn = document.querySelector(SELECTORS.POE2.BTN_GAME_START);
      if (safeClick(startBtn as HTMLElement)) {
        console.log("[Poe2MainHandler] Clicked POE2 Main Start Button");
        if (obs) obs.disconnect();
        return true;
      }
      return false;
    });
  },
};

const LauncherCheckHandler: PageHandler = {
  name: "LauncherCheckHandler",
  description: "Launcher Init Page (Login Required Check)",
  match: (url) => {
    return (
      url.hostname === "pubsvc.game.daum.net" &&
      (url.pathname.includes("/gamestart/poe.html") ||
        url.pathname.includes("/gamestart/poe2.html"))
    );
  },
  execute: () => {
    console.log(`[Handler] Executing ${LauncherCheckHandler.name}`);
    observeAndInteract((obs) => {
      const bodyText = document.body.innerText;
      if (
        SELECTORS.LAUNCHER.LOGIN_REQUIRED_TEXTS.some((text) =>
          bodyText.includes(text),
        )
      ) {
        console.log("[LauncherCheckHandler] Login Required Detected.");
        const confirmBtn = document.querySelector(
          SELECTORS.LAUNCHER.BTN_CONFIRM,
        );
        if (safeClick(confirmBtn as HTMLElement)) {
          if (obs) obs.disconnect();
          return true;
        }
      }
      return false;
    });
  },
};

const DaumLoginHandler: PageHandler = {
  name: "DaumLoginHandler",
  description: "Daum Login Page",
  match: (url) => url.hostname === "logins.daum.net",
  execute: () => {
    console.log(`[Handler] Executing ${DaumLoginHandler.name}`);
    observeAndInteract((obs) => {
      const selectors = [
        SELECTORS.LOGIN_DAUM.BTN_KAKAO_LOGIN,
        SELECTORS.LOGIN_DAUM.BTN_KAKAO_LEGACY,
      ];
      for (const sel of selectors) {
        const btn = document.querySelector(sel);
        if (safeClick(btn as HTMLElement)) {
          if (obs) obs.disconnect();
          return true;
        }
      }
      return false;
    });
  },
};

const KakaoSimpleLoginHandler: PageHandler = {
  name: "KakaoSimpleLoginHandler",
  description: "Kakao Simple Login Page - Auto Click First Account",
  match: (url) =>
    url.hostname === "accounts.kakao.com" &&
    url.pathname.includes("/login/simple"),
  execute: () => {
    console.log(`[Handler] Executing ${KakaoSimpleLoginHandler.name}`);
    observeAndInteract((obs) => {
      // Try to click the first account in the list
      const firstItem = document.querySelector(
        SELECTORS.KAKAO_SIMPLE.FIRST_ACCOUNT,
      );

      if (safeClick(firstItem as HTMLElement)) {
        console.log("[KakaoSimpleLoginHandler] Clicked first account in list.");
        if (obs) obs.disconnect();
        return true;
      }
      return false;
    });
  },
};

const KakaoAuthHandler: PageHandler = {
  name: "KakaoAuthHandler",
  description: "Kakao OAuth Consent",
  match: (url) =>
    url.hostname === "kauth.kakao.com" &&
    url.pathname.includes("/oauth/authorize"),
  execute: () => {
    console.log(`[Handler] Executing ${KakaoAuthHandler.name}`);
    observeAndInteract((obs) => {
      const agreeBtn = document.querySelector(SELECTORS.KAKAO_AUTH.BTN_AGREE);
      if (safeClick(agreeBtn as HTMLElement)) {
        if (obs) obs.disconnect();
        return true;
      }
      return false;
    });
  },
};

const SecurityCenterHandler: PageHandler = {
  name: "SecurityCenterHandler",
  description: "Security Center / Designated PC",
  match: (url) => url.hostname === "security-center.game.daum.net",
  execute: () => {
    console.log(`[Handler] Executing ${SecurityCenterHandler.name}`);
    ipcRenderer.send("game-status-update", "authenticating", activeGameContext);

    observeAndInteract((obs) => {
      // 1. Attribute Match
      if (
        safeClick(
          document.querySelector(
            SELECTORS.SECURITY.PC_INFO_BTN_ATTR,
          ) as HTMLElement,
        )
      ) {
        if (obs) obs.disconnect();
        return true;
      }
      // 2. Class Match
      if (
        safeClick(
          document.querySelector(
            SELECTORS.SECURITY.BTN_DESIGNATED_CONFIRM,
          ) as HTMLElement,
        )
      ) {
        if (obs) obs.disconnect();
        return true;
      }
      // 3. Generic Popup
      if (
        safeClick(
          document.querySelector(
            SELECTORS.SECURITY.BTN_POPUP_CONFIRM,
          ) as HTMLElement,
        )
      ) {
        if (obs) obs.disconnect();
        return true;
      }
      return false;
    });
  },
};

const LauncherCompletionHandler: PageHandler = {
  name: "LauncherCompletionHandler",
  description: "Launcher Completion / Game Launch Confirmed",
  match: (url) =>
    url.hostname === "pubsvc.game.daum.net" &&
    url.pathname.includes("/completed.html"),
  execute: () => {
    console.log(`[Handler] Executing ${LauncherCompletionHandler.name}`);
    ipcRenderer.send("game-status-update", "ready", activeGameContext);

    observeAndInteract((obs) => {
      for (const sel of SELECTORS.LAUNCHER.GAME_START_BUTTONS) {
        const btn = document.querySelector(sel);
        if (safeClick(btn as HTMLElement)) {
          if (obs) obs.disconnect();
          return true;
        }
      }
      return false;
    });
  },
};

// --- Handler Registry ---

const HANDLERS: PageHandler[] = [
  PoeMainHandler,
  Poe2MainHandler,
  LauncherCheckHandler,
  DaumLoginHandler,
  KakaoSimpleLoginHandler,
  KakaoAuthHandler,
  SecurityCenterHandler,
  LauncherCompletionHandler,
];

// --- Core Dispatcher ---

function dispatchPageLogic() {
  const currentUrl = new URL(window.location.href);
  console.log(`[Game Window] Logic Dispatcher: ${currentUrl.href}`);

  for (const handler of HANDLERS) {
    if (handler.match(currentUrl)) {
      console.log(`[Game Window] Matched Handler: ${handler.name}`);
      handler.execute();
      return;
    }
  }
}

// Context State
let activeGameContext: GameSessionContext | null = null;

// Load persisted context
try {
  // Safe Storage Check
  const stored =
    typeof window !== "undefined" && window.sessionStorage
      ? sessionStorage.getItem("activeGameContext")
      : null;

  if (stored) {
    activeGameContext = JSON.parse(stored);
    console.log(
      "[Game Window] Restored Context from SessionStorage:",
      activeGameContext,
    );
  }
} catch (e) {
  console.warn("[Game Window] SessionStorage access denied or failed:", e);
}

// --- IPC Listeners ---

ipcRenderer.on("execute-game-start", (_event, context: GameSessionContext) => {
  console.log('[Game Window] IPC "execute-game-start" RECEIVED!', context);
  if (context && context.gameId && context.serviceId) {
    activeGameContext = context;
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        sessionStorage.setItem("activeGameContext", JSON.stringify(context));
      }
    } catch (e) {
      console.warn(
        "[Game Window] Failed to persist context to SessionStorage:",
        e,
      );
    }
  }
});

// --- Initialization ---

window.addEventListener("DOMContentLoaded", () => {
  console.log("[Game Window] DOMContentLoaded");
  document.body.style.border = "2px solid #ff00ff"; // Visual Debug (Purple)
  dispatchPageLogic();
});

console.log("[Game Window] Preload Loaded");
