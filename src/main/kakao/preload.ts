import { ipcRenderer } from "electron";

import { AppConfig } from "../../shared/types";
import { isUserFacingPage } from "../../shared/visibility";
import { logger } from "../utils/preload-logger";

// --- Interfaces ---

interface HandlerContext {
  setVisible: (visible: boolean) => void;
}

interface GameSessionContext {
  gameId: AppConfig["activeGame"];
  serviceId: AppConfig["serviceChannel"];
}

interface PageHandler {
  name: string;
  description: string;
  /** Condition to activate this handler */
  match: (url: URL) => boolean;
  /** If true, this page should be forcefully shown regardless of "Inactive Window" setting */
  visible?: boolean;
  /** Main logic execution */
  execute: (context: HandlerContext) => Promise<void> | void;
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
  KAKAO_LOGIN: {
    CHECKBOX_SAVE: 'input[name="saveSignedIn"]',
    CONTAINER_CHOICE: ".item_choice",
    BTN_LOGIN: 'button[type="submit"], .btn_g',
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
      logger.log(
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
      logger.log("[Game Window] Performing native .click()");
      element.click();
      return true;
    }

    // 3. Fallback: Dispatch Event
    logger.log("[Game Window] Native click not function, dispatching event.");
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    return true;
  } catch (err) {
    logger.error("[Game Window] safeClick failed:", err);
    return false;
  }
}

function observeAndInteract(
  checkFn: (obs?: MutationObserver) => boolean,
  timeoutMs: number = 10000,
) {
  if (checkFn()) return;

  logger.log(
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
      logger.log("[Game Window] Observer timed out.");
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
  visible: true,
  execute: async () => {
    logger.log(`[Handler] Executing ${PoeMainHandler.name}`);
    observeAndInteract((obs) => {
      const startBtn = document.querySelector(SELECTORS.POE1.BTN_GAME_START);
      if (safeClick(startBtn as HTMLElement)) {
        logger.log("[PoeMainHandler] Clicked POE1 Start Button");
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
  visible: true,
  execute: async () => {
    logger.log(`[Handler] Executing ${Poe2MainHandler.name}`);

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
        logger.log("[Poe2MainHandler] Intro Modal cookie present, skipping.");
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
            logger.log('[Poe2MainHandler] Clicked "Today Close"');
          } else if (closeBtn && safeClick(closeBtn as HTMLElement)) {
            logger.log('[Poe2MainHandler] Clicked "Close X"');
          }
          await new Promise((r) => setTimeout(r, 500)); // Small delay after close
        }
      }
    };

    // 2. Observer for Button Interactivity
    observeAndInteract((obs) => {
      // Try handling modal first in every mutation cycle if it exists
      handleIntroModal().catch(logger.error);

      const startBtn = document.querySelector(SELECTORS.POE2.BTN_GAME_START);
      if (safeClick(startBtn as HTMLElement)) {
        logger.log("[Poe2MainHandler] Clicked POE2 Main Start Button");
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
    logger.log(`[Handler] Executing ${LauncherCheckHandler.name}`);
    observeAndInteract((obs) => {
      const bodyText = document.body.innerText;
      if (
        SELECTORS.LAUNCHER.LOGIN_REQUIRED_TEXTS.some((text) =>
          bodyText.includes(text),
        )
      ) {
        logger.log("[LauncherCheckHandler] Login Required Detected.");
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
    logger.log(`[Handler] Executing ${DaumLoginHandler.name}`);
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

const KakaoLoginHandler: PageHandler = {
  name: "KakaoLoginHandler",
  description: "Kakao Login Page - Auto Check 'Save Login'",
  match: (url) =>
    url.hostname === "accounts.kakao.com" &&
    url.pathname.includes("/login") &&
    !url.pathname.includes("/simple"),
  execute: () => {
    logger.log(`[Handler] Executing ${KakaoLoginHandler.name}`);

    let hasAutoChecked = false;

    observeAndInteract((_obs) => {
      const checkbox = document.querySelector(
        SELECTORS.KAKAO_LOGIN.CHECKBOX_SAVE,
      ) as HTMLInputElement;

      if (checkbox) {
        // 1. Initial Auto-check (Official click to sync state, only ONCE)
        if (!hasAutoChecked) {
          if (!checkbox.checked) {
            logger.log("[KakaoLoginHandler] Performing initial auto-check.");
            checkbox.click();
          }
          hasAutoChecked = true;
        }

        // 2. Setup Warning UI for uncheck action
        const container = (checkbox.closest(".set_login") ||
          checkbox.closest(
            SELECTORS.KAKAO_LOGIN.CONTAINER_CHOICE,
          )) as HTMLElement;

        if (
          container &&
          !container.nextElementSibling?.classList.contains(
            "launcher-warning-msg",
          )
        ) {
          const warningMsg = document.createElement("div");
          warningMsg.className = "launcher-warning-msg";
          warningMsg.style.display = checkbox.checked ? "none" : "block";
          warningMsg.style.width = "100%";
          warningMsg.style.marginTop = "10px";
          warningMsg.style.boxSizing = "border-box";

          const alertBox = document.createElement("div");
          alertBox.style.border = "1px solid #7e6c42";
          alertBox.style.borderRadius = "6px";
          alertBox.style.padding = "12px";
          alertBox.style.backgroundColor = "rgba(126, 108, 66, 0.05)";
          alertBox.style.display = "flex";
          alertBox.style.flexDirection = "column";
          alertBox.style.gap = "6px";

          const sourceLabel = document.createElement("div");
          sourceLabel.innerText = "POE UNOFFICIAL LAUNCHER";
          sourceLabel.style.fontSize = "10px";
          sourceLabel.style.fontWeight = "bold";
          sourceLabel.style.color = "#7e6c42";
          sourceLabel.style.letterSpacing = "0.5px";
          sourceLabel.style.opacity = "0.8";

          const textWrapper = document.createElement("div");
          textWrapper.style.display = "flex";
          textWrapper.style.alignItems = "flex-start";
          textWrapper.style.gap = "8px";

          const warningIcon = document.createElement("span");
          warningIcon.style.display = "flex";
          warningIcon.style.alignItems = "center";
          warningIcon.style.marginTop = "2px";
          warningIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="#ff4d4f"><path d="m40-120 440-760 440 760H40Zm138-80h604L480-720 178-200Zm302-40q17 0 28.5-11.5T520-280q0-17-11.5-28.5T480-320q-17 0-28.5 11.5T440-280q0 17 11.5 28.5T480-240Zm-40-120h80v-200h-80v200Zm40-100Z"/></svg>`;

          const text = document.createElement("span");
          text.innerText =
            "간편로그인을 저장하지 않으면 매번 아이디와 패스워드 입력이 필요합니다.";
          text.style.color = "#ff4d4f";
          text.style.fontSize = "12px";
          text.style.lineHeight = "1.5";

          textWrapper.appendChild(warningIcon);
          textWrapper.appendChild(text);
          alertBox.appendChild(sourceLabel);
          alertBox.appendChild(textWrapper);
          warningMsg.appendChild(alertBox);
          container.insertAdjacentElement("afterend", warningMsg);

          checkbox.addEventListener("change", () => {
            warningMsg.style.display = checkbox.checked ? "none" : "block";
          });
        }

        // We don't disconnect the observer here because the UI might re-render (dynamic tabs)
        return true;
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
    logger.log(`[Handler] Executing ${KakaoSimpleLoginHandler.name}`);
    observeAndInteract((obs) => {
      // Try to click the first account in the list
      const firstItem = document.querySelector(
        SELECTORS.KAKAO_SIMPLE.FIRST_ACCOUNT,
      );

      if (safeClick(firstItem as HTMLElement)) {
        logger.log("[KakaoSimpleLoginHandler] Clicked first account in list.");
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
    logger.log(`[Handler] Executing ${KakaoAuthHandler.name}`);
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
    logger.log(`[Handler] Executing ${SecurityCenterHandler.name}`);
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
    logger.log(`[Handler] Executing ${LauncherCompletionHandler.name}`);
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
  KakaoLoginHandler,
  KakaoSimpleLoginHandler,
  KakaoAuthHandler,
  SecurityCenterHandler,
  LauncherCompletionHandler,
];

// --- Core Dispatcher ---

function dispatchPageLogic() {
  const currentUrl = new URL(window.location.href);
  logger.log(`[Game Window] Logic Dispatcher: ${currentUrl.href}`);

  for (const handler of HANDLERS) {
    if (handler.match(currentUrl)) {
      logger.log(`[Game Window] Matched Handler: ${handler.name}`);

      // 1. Check Visibility Requirement
      if (handler.visible) {
        logger.log(
          `[Game Window] Handler requires visibility. Requesting show...`,
        );
        ipcRenderer.send("window-visibility-request", true);
      }

      // 2. Execute Handler with Context
      const handlerContext: HandlerContext = {
        setVisible: (visible: boolean) => {
          logger.log(`[Game Window] Dynamic Visibility Request: ${visible}`);
          ipcRenderer.send("window-visibility-request", visible);
        },
      };

      handler.execute(handlerContext);
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
    logger.log(
      "[Game Window] Restored Context from SessionStorage:",
      activeGameContext,
    );
  }
} catch (e) {
  logger.warn("[Game Window] SessionStorage access denied or failed:", e);
}

// --- IPC Listeners ---

ipcRenderer.on("execute-game-start", (_event, context: GameSessionContext) => {
  logger.log('[Game Window] IPC "execute-game-start" RECEIVED!', context);
  if (context && context.gameId && context.serviceId) {
    activeGameContext = context;
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        sessionStorage.setItem("activeGameContext", JSON.stringify(context));
      }
    } catch (e) {
      logger.warn(
        "[Game Window] Failed to persist context to SessionStorage:",
        e,
      );
    }
  }
});

// --- Initialization ---

window.addEventListener("DOMContentLoaded", () => {
  logger.log("[Game Window] DOMContentLoaded");

  const currentUrl = new URL(window.location.href);

  // If the page is NOT a standard user-facing page (according to main.ts policy),
  // show a debug border to indicate it's a "background/automated" window.
  if (!isUserFacingPage(currentUrl)) {
    document.body.style.border = "2px solid #ff00ff"; // Visual Debug (Purple)
  }

  dispatchPageLogic();
});

logger.log("[Game Window] Preload Loaded");
