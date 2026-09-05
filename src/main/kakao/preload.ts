import { ipcRenderer } from "electron";

import {
  findKakaoAccountValidationElements,
  getElementText,
} from "./account-validation-dom";
import { AutomationClock } from "./automation-clock";
import {
  hasVisibleKakaoLoginForm,
  hasVisibleKakaoQrLoginPrompt,
  getSecurityCenterVisibilityState,
  isDaumGameLoginRedirect,
  type PageVisibilityMode,
  DAUM_GAME_LOGIN_REDIRECT_GRACE_MS,
  SECURITY_CENTER_UNRESOLVED_REVEAL_DELAY_MS,
  shouldRequestVisibilityOnHandlerMatch,
  shouldRevealUnhandledAutomatedPage,
  shouldSignalDaumGameLoginRequired,
  UNHANDLED_PAGE_REVEAL_DELAY_MS,
  USER_REQUIRED_PAGE_REVEAL_DELAY_MS,
} from "./visibility-policy";
import {
  formatKakaoDiagnostic,
  KakaoDiagnosticLimiter,
  type KakaoDiagnosticFields,
} from "../../shared/kakao-diagnostics";
import {
  isKakaoGamesAgreementUrl,
  isKakaoGamesMemberLoginUrl,
  isKakaoLauncherUrl,
  isKakaoMemberUrl,
  isKakaoPoeHomeUrl,
  isKakaoStarterInstallPopupUrl,
  isKakaoSecurityCenterUrl,
} from "../../shared/kakao-url-policy";
import { AppConfig } from "../../shared/types";
import { logger } from "../utils/preload-logger";

// --- Interfaces ---

interface HandlerContext {
  setVisible: (visible: boolean) => void;
  getCurrentUrl: () => string;
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
  /** Page-level visibility behavior when the handler matches. */
  visibility?: PageVisibilityMode;
  /** List of trigger contexts this handler is active for. If undefined, active for all. */
  triggeredBy?: string[];
  /**
   * Timeout for this specific page in milliseconds.
   * Set to -1 to disable timeout (e.g. for login pages).
   * Default is 10000ms if not specified.
   */
  timeoutMs?: number;
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
    QR_CHECKBOX: "#label-staySignedIn",
    QR_INPUT: 'input[name="staySignedIn"]',
    CONTAINER_CHOICE: ".item_choice",
    BTN_LOGIN: 'button[type="submit"], .btn_g',
  },
  KAKAO_SIMPLE: {
    // Select first account in list (target a[role="button"] for semantic click)
    FIRST_ACCOUNT: ".list_easy li:first-child a[role='button']",
  },
  KAKAO_GAMES_MEMBER: {
    BTN_KAKAO_LOGIN: "button.btn-common.btn-type--icon.btn-type__emph3",
    BTN_KAKAO_ICON: ".icon-kakaocapri",
  },
};

// --- Utils ---

// --- Global State ---
let isValidationMode = false;
let automationDocumentId: number | null = null;
let pageDeferred = false;
let pageStarted = false;
const automationClock = new AutomationClock();
const diagnosticLimiter = new KakaoDiagnosticLimiter();
let diagnosticHandler: string | undefined;

function diagnosePage(event: string, fields: KakaoDiagnosticFields = {}) {
  try {
    const data = {
      documentId: automationDocumentId,
      handler: diagnosticHandler,
      url: window.location.href,
      paused: automationClock.paused,
      validation: isValidationMode,
      ...fields,
    };
    const occurrences = diagnosticLimiter.include(event, data);
    if (occurrences)
      logger.log(formatKakaoDiagnostic(event, { ...data, occurrences }));
  } catch {
    /* Diagnostic failures must not affect page automation. */
  }
}

function sendPageMessage(channel: string, ...args: unknown[]) {
  const fields = {
    channel,
    requestedVisible:
      channel === "window-visibility-request" ? args[0] : undefined,
    status: channel === "game-status-update" ? args[0] : undefined,
    timeoutMs: channel.endsWith(":update-timeout") ? args[0] : undefined,
  };
  if (automationClock.paused) {
    diagnosePage("ipc.suppressed", { ...fields, reason: "paused" });
    return;
  }
  diagnosePage("ipc.sent", fields);
  ipcRenderer.send(channel, ...args, automationDocumentId);
}

/**
 * Helper to request visibility with automatic sizing
 */
function requestWindowVisibility(visible: boolean) {
  // Suppress visibility requests if in validation mode and window is not already shown
  if (isValidationMode && visible) {
    diagnosePage("visibility.suppressed", {
      requestedVisible: visible,
      reason: "validation",
    });
    logger.log(
      "[Game Window] Background validation mode, auto-show suppressed.",
    );
    return;
  }

  sendPageMessage("window-visibility-request", visible);
}

function createVisibilityRequest(context: HandlerContext, description: string) {
  let didRequest = false;

  return (reason: string) => {
    if (didRequest) {
      diagnosePage("visibility.suppressed", {
        reason: "already-requested",
        requestedVisible: true,
      });
      return;
    }
    didRequest = true;

    logger.log(
      `[Visibility] ${description} requires user attention (${reason}).`,
    );
    context.setVisible(true);
  };
}

function serializeAutomationError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: "Error",
    message: String(error),
    stack: undefined,
  };
}

function reportAutomationFailure(handlerName: string, error: unknown) {
  const serialized = serializeAutomationError(error);
  sendPageMessage("kakao:automation-failure", {
    errorCode: "KAKAO_AUTOMATION_HANDLER_FAILURE",
    handlerName,
    url: window.location.href,
    context: activeGameContext,
    ...serialized,
  });
}

function reportStartButtonTimeout(handlerName: string) {
  const message = `${handlerName} timed out while waiting for the Kakao game start button.`;
  sendPageMessage("kakao:automation-failure", {
    errorCode: "KAKAO_START_BUTTON_TIMEOUT",
    handlerName,
    url: window.location.href,
    context: activeGameContext,
    name: "Error",
    message,
    stack: undefined,
  });
}

function scheduleStableVisibilityReveal(options: {
  description: string;
  isReady: () => boolean;
  reveal: (reason: string) => void;
  delayMs?: number;
  fallbackToStablePage?: boolean;
}) {
  const initialUrl = window.location.href;
  const delayMs = options.delayMs ?? USER_REQUIRED_PAGE_REVEAL_DELAY_MS;

  const timeoutId = automationClock.setTimeout(() => {
    if (window.location.href !== initialUrl) {
      logger.log(
        `[Visibility] ${options.description} reveal skipped: URL changed before ${delayMs}ms.`,
      );
      return;
    }

    if (options.isReady()) {
      options.reveal("interactive UI detected after delay");
      return;
    }

    if (options.fallbackToStablePage) {
      options.reveal(`page stayed unresolved for ${delayMs}ms`);
      return;
    }

    logger.log(
      `[Visibility] ${options.description} reveal skipped: interactive UI not detected.`,
    );
  }, delayMs);

  return () => automationClock.clearTimeout(timeoutId);
}

function safeClick(
  element: HTMLElement | null,
  description: string = "element",
) {
  if (!element || automationClock.paused) return false;

  const identity = element.id
    ? `#${element.id}`
    : element.className
      ? `.${element.className.split(" ").join(".")}`
      : "unknown";

  try {
    logger.log(`[SafeClick] Attempting click on ${description} (${identity})`);

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
    logger.error(`[Game Window] safeClick failed on ${description}:`, err);
    return false;
  }
}

function observeAndInteract(
  checkFn: (obs?: MutationObserver) => boolean,
  timeoutMs: number = 10000,
  onTimeout?: () => void,
) {
  if (!automationClock.paused && checkFn()) return;

  const startedAt = Date.now();
  const handler = diagnosticHandler;
  diagnosePage("observer.started", { handler, timeoutMs });

  logger.log(
    "[Game Window] Target not found immediately. Starting observer...",
  );

  let completed = false;
  let timeoutId: number | undefined;
  const check = () => {
    if (automationClock.paused) return;
    if (checkFn(observer)) {
      completed = true;
      if (timeoutId !== undefined) automationClock.clearTimeout(timeoutId);
    }
  };
  const observer = new MutationObserver(check);
  const unsubscribe = automationClock.onResume(check);
  const disconnect = observer.disconnect.bind(observer);
  let stopReason = "disconnected";
  // Some login handlers keep observing after a successful match for dynamic UI.
  // Preserve the handler's explicit disconnect decision while cleaning up our clock.
  observer.disconnect = () => {
    diagnosePage("observer.stopped", {
      handler,
      reason: stopReason,
      elapsedMs: Date.now() - startedAt,
      timeoutMs,
    });
    disconnect();
    unsubscribe();
    if (timeoutId !== undefined) automationClock.clearTimeout(timeoutId);
  };

  observer.observe(document.body, { childList: true, subtree: true });

  if (timeoutMs > 0) {
    timeoutId = automationClock.setTimeout(() => {
      if (completed) return;
      stopReason = "timeout";
      observer.disconnect();
      unsubscribe();
      logger.log("[Game Window] Observer timed out.");
      onTimeout?.();
    }, timeoutMs);
  }
}

// --- Handler Implementations ---

/**
 * POE1 Main Page Handler
 * Matches the Kakao PoE1 homepage during a game-start flow.
 */
const PoeMainHandler: PageHandler = {
  name: "PoeMainHandler",
  description: "POE1 Homepage - Game Start",
  match: (url) =>
    isKakaoPoeHomeUrl(url, "POE1") && url.hash.includes("autoStart"),
  triggeredBy: ["GAME_START_POE1"],
  execute: async () => {
    logger.log(`[Handler] Executing ${PoeMainHandler.name}`);

    observeAndInteract(
      (obs) => {
        const startBtn = document.querySelector(SELECTORS.POE1.BTN_GAME_START);
        if (safeClick(startBtn as HTMLElement)) {
          logger.log("[PoeMainHandler] Clicked POE1 Start Button");
          if (obs) obs.disconnect();
          return true;
        }
        return false;
      },
      10000,
      () => reportStartButtonTimeout(PoeMainHandler.name),
    );
  },
};

/**
 * Account Validation Handler
 * Scans POE1/POE2 homepage for Account ID or Login requirement
 */
const AccountValidationHandler: PageHandler = {
  name: "AccountValidationHandler",
  description: "Account Verification (Hidden Background)",
  match: (url) => isKakaoPoeHomeUrl(url) && isValidationMode,
  timeoutMs: -1, // No timeout for background validation
  triggeredBy: ["ACCOUNT_VALIDATION"],
  execute: async () => {
    logger.log(`[Handler] Executing ${AccountValidationHandler.name}`);

    let isSyncClicked = false;
    let lastTier1LogTime = 0;

    observeAndInteract((obs) => {
      // --- Tier 1: GGB Check (Daum Auth) ---
      const { ggbNickname, ggbLoginBtn, statusBarNickname, statusBarLoginBtn } =
        findKakaoAccountValidationElements(document);

      if (!ggbNickname) {
        if (ggbLoginBtn) {
          logger.log(
            "[AccountValidationHandler] Tier 1 Error: Not logged in to GGB. Clicking Login.",
          );
          safeClick(ggbLoginBtn as HTMLElement, "GGB Login Button");
          return false; // Wait for navigation
        }
        return false;
      }

      // --- Tier 2: StatusBar Check (POE Session Sync) ---
      // Throttle Tier 1 log to once every 5 seconds to reduce noise
      const now = Date.now();
      if (now - lastTier1LogTime > 5000) {
        logger.log(
          `[AccountValidationHandler] Tier 1 Success: GGB Logged in (${getElementText(ggbNickname)})`,
        );
        lastTier1LogTime = now;
      }

      // Found POE Account ID!
      const accountId = getElementText(statusBarNickname);
      if (accountId) {
        logger.log(
          `[AccountValidationHandler] Tier 2 Success: Found POE Account ID: ${accountId}`,
        );
        sendPageMessage("kakao:account-id-fetched", accountId);
        if (obs) obs.disconnect();
        return true;
      }

      // GGB is logged in, but StatusBar isn't. Need to sync.
      if (statusBarLoginBtn && !isSyncClicked) {
        logger.log(
          "[AccountValidationHandler] Tier 2 Error: StatusBar needs sync. Clicking Login Link.",
        );
        isSyncClicked = true; // Prevents spamming clicks/logs before navigation
        safeClick(statusBarLoginBtn as HTMLElement, "StatusBar Login Link");
        return false; // Wait for navigation
      }

      return false;
    });
  },
};

const DaumGameLoginValidationHandler: PageHandler = {
  name: "DaumGameLoginValidationHandler",
  description: "Daum Game Login Redirect (Validation Mode)",
  match: (url) => isDaumGameLoginRedirect(url),
  timeoutMs: -1,
  triggeredBy: ["ACCOUNT_VALIDATION"],
  execute: (ctx) => {
    const initialHref = window.location.href;
    logger.log(
      `[Validator] Detected Daum game login redirect during validation: ${initialHref}. Waiting ${DAUM_GAME_LOGIN_REDIRECT_GRACE_MS}ms before signalling login-required.`,
    );

    ctx.setVisible(false);

    automationClock.setTimeout(() => {
      if (
        !shouldSignalDaumGameLoginRequired(initialHref, window.location.href)
      ) {
        logger.log(
          `[Validator] Daum login redirect resolved before login-required signal: ${window.location.href}`,
        );
        return;
      }

      sendPageMessage("kakao:login-required", { url: initialHref });
      logger.log("[Validator] Validation stopped at Daum login redirect.");
    }, DAUM_GAME_LOGIN_REDIRECT_GRACE_MS);
  },
};

/**
 * POE2 Main Page Handler
 * Matches the Kakao PoE2 homepage during a game-start flow.
 * Handles Intro Modal & Game Start Button
 */
const Poe2MainHandler: PageHandler = {
  name: "Poe2MainHandler",
  description: "POE2 Homepage - Intro Modal & Game Start",
  match: (url) =>
    isKakaoPoeHomeUrl(url, "POE2") && url.hash.includes("autoStart"),
  triggeredBy: ["GAME_START_POE2"],
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
          await new Promise<void>((r) => automationClock.setTimeout(r, 500)); // Small delay after close
        }
      }
    };

    // 2. Observer for Button Interactivity
    observeAndInteract(
      (obs) => {
        // Try handling modal first in every mutation cycle if it exists
        handleIntroModal().catch(logger.error);

        const startBtn = document.querySelector(SELECTORS.POE2.BTN_GAME_START);
        if (safeClick(startBtn as HTMLElement)) {
          logger.log("[Poe2MainHandler] Clicked POE2 Main Start Button");
          if (obs) obs.disconnect();
          return true;
        }
        return false;
      },
      10000,
      () => reportStartButtonTimeout(Poe2MainHandler.name),
    );
  },
};

const LauncherCheckHandler: PageHandler = {
  name: "LauncherCheckHandler",
  description: "Launcher Init Page (Login Required Check)",
  match: (url) => {
    return (
      isKakaoLauncherUrl(url) &&
      (url.pathname.includes("/gamestart/poe.html") ||
        url.pathname.includes("/gamestart/poe2.html"))
    );
  },
  triggeredBy: ["GAME_START_POE1", "GAME_START_POE2"],
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
  timeoutMs: -1, // No timeout for login
  triggeredBy: ["GAME_START_POE1", "GAME_START_POE2", "ACCOUNT_VALIDATION"],
  execute: (context) => {
    logger.log(`[Handler] Executing ${DaumLoginHandler.name}`);

    const reveal = createVisibilityRequest(context, "Daum login page");
    const cancelReveal = scheduleStableVisibilityReveal({
      description: "Daum login page",
      isReady: () => false,
      reveal,
      fallbackToStablePage: true,
    });

    observeAndInteract((obs) => {
      const selectors = [
        SELECTORS.LOGIN_DAUM.BTN_KAKAO_LOGIN,
        SELECTORS.LOGIN_DAUM.BTN_KAKAO_LEGACY,
      ];
      for (const sel of selectors) {
        const btn = document.querySelector(sel);
        if (safeClick(btn as HTMLElement)) {
          cancelReveal();
          context.setVisible(false);
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
  timeoutMs: -1, // Interaction might be needed
  triggeredBy: ["GAME_START_POE1", "GAME_START_POE2", "ACCOUNT_MANUAL_LOGIN"],
  execute: (context) => {
    logger.log(`[Handler] Executing ${KakaoLoginHandler.name}`);

    let hasAutoChecked = false;
    const reveal = createVisibilityRequest(context, "Kakao login page");

    scheduleStableVisibilityReveal({
      description: "Kakao login page",
      isReady: () => hasVisibleKakaoLoginForm(document),
      reveal,
      fallbackToStablePage: true,
    });

    observeAndInteract((_obs) => {
      if (hasVisibleKakaoLoginForm(document)) {
        reveal("login input form detected");
      }

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

const KakaoQRLoginHandler: PageHandler = {
  name: "KakaoQRLoginHandler",
  description: "Kakao QR Login Page - Auto Check 'Stay Signed In'",
  match: (url) =>
    url.hostname === "accounts.kakao.com" && url.pathname.includes("/qr_login"),
  timeoutMs: -1, // QR login needs time
  triggeredBy: ["GAME_START_POE1", "GAME_START_POE2", "ACCOUNT_MANUAL_LOGIN"],
  execute: (context) => {
    logger.log(`[Handler] Executing ${KakaoQRLoginHandler.name}`);

    let hasAutoChecked = false;
    const reveal = createVisibilityRequest(context, "Kakao QR login page");

    scheduleStableVisibilityReveal({
      description: "Kakao QR login page",
      isReady: () => hasVisibleKakaoQrLoginPrompt(document),
      reveal,
      fallbackToStablePage: true,
    });

    observeAndInteract((_obs) => {
      if (hasVisibleKakaoQrLoginPrompt(document)) {
        reveal("QR login prompt detected");
      }

      const checkboxLabel = document.querySelector(
        SELECTORS.KAKAO_LOGIN.QR_CHECKBOX,
      ) as HTMLElement;
      // In QR login, the checkbox is often an input inside or linked to a label
      const checkboxInput = document.querySelector(
        SELECTORS.KAKAO_LOGIN.QR_INPUT,
      ) as HTMLInputElement;

      if (checkboxLabel && checkboxInput) {
        // 1. Initial Auto-check - Must click the LABEL (#label-staySignedIn) as requested
        if (!hasAutoChecked) {
          if (!checkboxInput.checked) {
            logger.log(
              "[KakaoQRLoginHandler] Performing initial auto-check on label.",
            );
            checkboxLabel.click();
          }
          hasAutoChecked = true;
        }

        // 2. Setup Warning UI (Reuse style from KakaoLoginHandler)
        const container = checkboxLabel.closest(".item_choice") as HTMLElement;

        if (
          container &&
          !container.nextElementSibling?.classList.contains(
            "launcher-warning-msg",
          )
        ) {
          const warningMsg = document.createElement("div");
          warningMsg.className = "launcher-warning-msg";
          warningMsg.style.display = checkboxInput.checked ? "none" : "block";
          warningMsg.style.width = "100%";
          warningMsg.style.marginTop = "10px";
          warningMsg.style.boxSizing = "border-box";
          warningMsg.style.clear = "both"; // Force down as parent has flex

          const alertBox = document.createElement("div");
          alertBox.style.border = "1px solid #7e6c42";
          alertBox.style.borderRadius = "6px";
          alertBox.style.padding = "12px";
          alertBox.style.backgroundColor = "rgba(126, 108, 66, 0.05)";
          alertBox.style.display = "flex";
          alertBox.style.flexDirection = "column";
          alertBox.style.gap = "6px";
          alertBox.style.minWidth = "280px"; // Ensure enough width isn't squeezed

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

          // Layout optimization: check if parent is flex
          const parent = container.parentElement;
          if (parent && window.getComputedStyle(parent).display === "flex") {
            // If parent is horizontal flex, we need to handle layout
            warningMsg.style.flexBasis = "100%";
          }

          container.insertAdjacentElement("afterend", warningMsg);

          checkboxInput.addEventListener("change", () => {
            warningMsg.style.display = checkboxInput.checked ? "none" : "block";
          });

          // Also listen for clicks on label since that's how it's often toggled
          checkboxLabel.addEventListener("click", () => {
            // Delay to let the input state update
            automationClock.setTimeout(() => {
              warningMsg.style.display = checkboxInput.checked
                ? "none"
                : "block";
            }, 100);
          });
        }

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
  triggeredBy: ["GAME_START_POE1", "GAME_START_POE2", "ACCOUNT_VALIDATION"],
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

const KakaoGamesMemberLoginHandler: PageHandler = {
  name: "KakaoGamesMemberLoginHandler",
  description: "Kakao Games Member Login - Auto Click Kakao Login",
  match: (url) => isKakaoGamesMemberLoginUrl(url),
  timeoutMs: -1,
  triggeredBy: [
    "GAME_START_POE1",
    "GAME_START_POE2",
    "ACCOUNT_VALIDATION",
    "ACCOUNT_MANUAL_LOGIN",
  ],
  execute: (context) => {
    logger.log(`[Handler] Executing ${KakaoGamesMemberLoginHandler.name}`);

    observeAndInteract((obs) => {
      const kakaoLoginButton =
        document.querySelector(SELECTORS.KAKAO_GAMES_MEMBER.BTN_KAKAO_LOGIN) ||
        Array.from(document.querySelectorAll("button")).find((button) => {
          const text = button.textContent?.replace(/\s+/g, " ").trim() ?? "";
          return (
            text.includes("카카오 로그인") ||
            Boolean(
              button.querySelector(SELECTORS.KAKAO_GAMES_MEMBER.BTN_KAKAO_ICON),
            )
          );
        });

      if (safeClick(kakaoLoginButton as HTMLElement, "Kakao Games Login")) {
        context.setVisible(false);
        if (obs) obs.disconnect();
        return true;
      }

      return false;
    });
  },
};

const KakaoGamesAgreementHandler: PageHandler = {
  name: "KakaoGamesAgreementHandler",
  description: "Kakao Games Agreement Page",
  match: (url) => isKakaoGamesAgreementUrl(url),
  visibility: "user-required",
  timeoutMs: -1,
  triggeredBy: [
    "GAME_START_POE1",
    "GAME_START_POE2",
    "ACCOUNT_VALIDATION",
    "ACCOUNT_MANUAL_LOGIN",
  ],
  execute: () => {
    logger.log(`[Handler] Executing ${KakaoGamesAgreementHandler.name}`);
  },
};

const KakaoAuthHandler: PageHandler = {
  name: "KakaoAuthHandler",
  description: "Kakao OAuth Consent",
  match: (url) =>
    url.hostname === "kauth.kakao.com" &&
    url.pathname.includes("/oauth/authorize"),
  triggeredBy: ["GAME_START_POE1", "GAME_START_POE2", "ACCOUNT_MANUAL_LOGIN"],
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

// 해당 페이지는 동일한 URL에서 다른 페이지를 표시 하는 경우가 있음 (문자 인증, MOTP 등)
// 따라서 timeoutMs를 -1로 설정하고 observeAndInteract에서 일정 시간이 지나면 오류 없이 화면을 보여주도록 한다.
const SecurityCenterHandler: PageHandler = {
  name: "SecurityCenterHandler",
  description: "Security Center / Designated PC",
  match: (url) => isKakaoSecurityCenterUrl(url),
  timeoutMs: -1,
  triggeredBy: ["GAME_START_POE1", "GAME_START_POE2"],
  execute: (context) => {
    logger.log(`[Handler] Executing ${SecurityCenterHandler.name}`);
    sendPageMessage("game-status-update", "authenticating", activeGameContext);

    const reveal = createVisibilityRequest(context, "Security Center");
    let delayTimeoutId: number | null = null;

    const clearDelayedReveal = () => {
      if (delayTimeoutId === null) return;
      diagnosePage("security.reveal-cancelled");
      automationClock.clearTimeout(delayTimeoutId);
      delayTimeoutId = null;
    };

    const scheduleUnresolvedReveal = () => {
      if (delayTimeoutId !== null) return;
      diagnosePage("security.reveal-scheduled", {
        timeoutMs: SECURITY_CENTER_UNRESOLVED_REVEAL_DELAY_MS,
      });

      const initialUrl = window.location.href;
      delayTimeoutId = automationClock.setTimeout(() => {
        delayTimeoutId = null;
        diagnosePage("security.reveal-fired", {
          state: getSecurityCenterVisibilityState(document),
        });

        if (window.location.href !== initialUrl) {
          diagnosePage("security.reveal-cancelled", { reason: "url-changed" });
          logger.log(
            `[SecurityCenter] Delayed reveal skipped: URL changed before ${SECURITY_CENTER_UNRESOLVED_REVEAL_DELAY_MS}ms.`,
          );
          return;
        }

        const state = getSecurityCenterVisibilityState(document);
        if (state === "auto-progress") {
          diagnosePage("visibility.suppressed", {
            reason: "auto-progress",
            requestedVisible: true,
          });
          logger.log(
            "[SecurityCenter] Delayed reveal skipped: auto-progress UI is still active.",
          );
          context.setVisible(false);
          return;
        }

        if (state === "user-required") {
          reveal("security verification UI detected after delay");
          return;
        }

        reveal(
          `page stayed unresolved for ${SECURITY_CENTER_UNRESOLVED_REVEAL_DELAY_MS}ms`,
        );
      }, SECURITY_CENTER_UNRESOLVED_REVEAL_DELAY_MS);
    };

    let lastDiagnosticState: string | undefined;
    observeAndInteract((obs) => {
      const state = getSecurityCenterVisibilityState(document);
      if (state !== lastDiagnosticState) {
        lastDiagnosticState = state;
        diagnosePage("security.state", { state });
      }

      if (state === "user-required") {
        clearDelayedReveal();
        reveal("security verification UI detected");
        return false;
      }

      // 1. Attribute Match
      const clickedPcInfoButton =
        state === "auto-progress" &&
        (safeClick(
          document.querySelector(
            SELECTORS.SECURITY.PC_INFO_BTN_ATTR,
          ) as HTMLElement,
          "PC Info Button (Attribute)",
        ) ||
          safeClick(
            document.querySelector(
              SELECTORS.SECURITY.BTN_DESIGNATED_CONFIRM,
            ) as HTMLElement,
            "PC Info Button (Class)",
          ));

      if (clickedPcInfoButton) {
        diagnosePage("security.pc-info-click", { clicked: true, state });
        logger.log("[SecurityCenter] Clicked PC Info Button");
        clearDelayedReveal();
        context.setVisible(false);
        return false;
      }

      // 2. Generic Popup
      if (
        safeClick(
          document.querySelector(
            SELECTORS.SECURITY.BTN_POPUP_CONFIRM,
          ) as HTMLElement,
          "Generic Popup Confirm",
        )
      ) {
        clearDelayedReveal();
        context.setVisible(false);
        if (obs) obs.disconnect();
        return true;
      }

      const currentState = getSecurityCenterVisibilityState(document);
      if (currentState === "auto-progress") {
        clearDelayedReveal();
        context.setVisible(false);
        return false;
      }

      if (currentState === "user-required") {
        clearDelayedReveal();
        reveal("security verification UI detected");
        return false;
      }

      scheduleUnresolvedReveal();
      return false;
    });
  },
};

const LauncherCompletionHandler: PageHandler = {
  name: "LauncherCompletionHandler",
  description: "Launcher Completion / Game Launch Confirmed",
  match: (url) =>
    isKakaoLauncherUrl(url) && url.pathname.includes("/completed.html"),
  triggeredBy: ["GAME_START_POE1", "GAME_START_POE2"],
  execute: () => {
    logger.log(`[Handler] Executing ${LauncherCompletionHandler.name}`);
    sendPageMessage("game-status-update", "ready", activeGameContext);

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

const StarterInstallPopupHandler: PageHandler = {
  name: "StarterInstallPopupHandler",
  description: "Kakao Games Starter Install Popup",
  match: (url) => isKakaoStarterInstallPopupUrl(url),
  visibility: "user-required",
  timeoutMs: -1, // Installation takes time
  triggeredBy: ["GAME_START_POE1", "GAME_START_POE2"],
  execute: () => {
    logger.log(`[Handler] Executing ${StarterInstallPopupHandler.name}`);
  },
};

// --- Handler Registry ---

// --- Additional Visibility Handlers (from shared/visibility.ts) ---
const DaumMemberCertHandler: PageHandler = {
  name: "DaumMemberCertHandler",
  description: "Daum Member Certification",
  match: (url) =>
    isKakaoMemberUrl(url) && url.pathname.includes("/cert/kakao/init"),
  visibility: "user-required",
  timeoutMs: -1, // Certification needs user action
  triggeredBy: ["GAME_START_POE1", "GAME_START_POE2"],
  execute: () => {
    logger.log(`[Handler] Executing ${DaumMemberCertHandler.name}`);
  },
};

const KCBAuthHandler: PageHandler = {
  name: "KCBAuthHandler",
  description: "KCB Authentication",
  match: (url) => url.hostname === "safe.ok-name.co.kr",
  visibility: "user-required",
  timeoutMs: -1, // KCB Auth needs user action
  triggeredBy: ["GAME_START_POE1", "GAME_START_POE2"],
  execute: () => {
    logger.log(`[Handler] Executing ${KCBAuthHandler.name}`);
  },
};

const KCBCardAuthHandler: PageHandler = {
  name: "KCBCardAuthHandler",
  description: "KCB Card Authentication",
  match: (url) => url.hostname === "card.ok-name.co.kr",
  visibility: "user-required",
  timeoutMs: -1, // Card Auth needs user action
  triggeredBy: ["GAME_START_POE1", "GAME_START_POE2"],
  execute: () => {
    logger.log(`[Handler] Executing ${KCBCardAuthHandler.name}`);
  },
};

/**
 * KakaoLoginValidationHandler
 * Handles the login page redirect during background validation.
 * It prevents the window from showing and signals 'Login Required' with the current URL.
 */
const KakaoLoginValidationHandler: PageHandler = {
  name: "KakaoLoginValidationHandler",
  description: "Kakao Login Page (Validation Mode) - Capture URL & Disconnect",
  match: (url) =>
    url.hostname === "accounts.kakao.com" && url.pathname.includes("/login"),
  triggeredBy: ["ACCOUNT_VALIDATION"],
  execute: (ctx) => {
    logger.log(
      `[Validator] Detected Login Redirect during validation: ${window.location.href}`,
    );

    // Explicitly hide just in case
    ctx.setVisible(false);

    // Notify main process: Login is required, here is the context URL to resume later
    sendPageMessage("kakao:login-required", { url: window.location.href });

    // Stop validation since user interaction is needed
    logger.log("[Validator] Validation stuck at Login. Signalling failure.");
  },
};

/**
 * KakaoManualValidationHandler
 * Detects login success on homepage during manual login and hides window.
 */
const KakaoManualValidationHandler: PageHandler = {
  name: "KakaoManualValidationHandler",
  description: "Manual Login Success Detector",
  match: (url) => isKakaoPoeHomeUrl(url) && !url.hash.includes("autoStart"),
  triggeredBy: ["ACCOUNT_MANUAL_LOGIN"],
  execute: (ctx) => {
    logger.log(
      "[ManualLogin] Successfully reached homepage. Assuming login success.",
    );
    // 1. Hide Window
    ctx.setVisible(false);
    // 2. Clear Context so we don't accidentally match this again
    sendPageMessage("account:clear-trigger");
    // 3. Trigger immediate re-validation to refresh Account ID in UI
    sendPageMessage("account:trigger-validation", "Kakao Games");
  },
};

const HANDLERS: PageHandler[] = [
  KakaoSimpleLoginHandler, // Priority 1: Automated account selection (matches /login/simple)
  KakaoQRLoginHandler, // Priority 2: QR Login auto-check
  KakaoAuthHandler, // Priority 3: Automated OAuth consent
  KakaoGamesMemberLoginHandler,
  KakaoGamesAgreementHandler,
  KakaoLoginValidationHandler, // Priority 3: Roadblock/Failure capture for other /login pages
  KakaoManualValidationHandler, // Success Detector for manual mode
  DaumGameLoginValidationHandler,
  AccountValidationHandler,
  PoeMainHandler,
  Poe2MainHandler,
  LauncherCheckHandler,
  DaumLoginHandler,
  KakaoLoginHandler,
  SecurityCenterHandler,
  LauncherCompletionHandler,
  StarterInstallPopupHandler,
  DaumMemberCertHandler,
  KCBAuthHandler,
  KCBCardAuthHandler,
];

// --- Core Dispatcher ---

async function dispatchPageLogic(triggerContext?: string) {
  if (pageStarted) return;
  const page = await ipcRenderer.invoke("kakao:get-page-state");
  if (page.blocked) {
    diagnosePage("page.deferred", { documentId: page.documentId });
    pageDeferred = true;
    logger.log(
      "[Cloudflare] Page automation deferred until verification finishes.",
    );
    return;
  }
  if (pageStarted) return;
  pageStarted = true;
  pageDeferred = false;
  automationDocumentId = page.documentId;
  const currentUrl = new URL(window.location.href);
  logger.log(`[Game Window] Logic Dispatcher: ${currentUrl.href}`);

  // If triggerContext not provided (rare), fetch it
  if (!triggerContext) {
    triggerContext = await ipcRenderer.invoke("account:get-trigger-context");
  }
  logger.log(`[Game Window] Trigger Context: ${triggerContext || "NONE"}`);

  for (const handler of HANDLERS) {
    if (handler.match(currentUrl)) {
      // 0. Filter by Trigger Context (Isolation)
      if (handler.triggeredBy && triggerContext) {
        if (!handler.triggeredBy.includes(triggerContext)) {
          logger.log(
            `[Game Window] Handler ${handler.name} skipped: Context mismatch (${triggerContext}).`,
          );
          continue;
        }
      } else if (handler.triggeredBy && !triggerContext) {
        // Handler requires a context, but none provided
        logger.log(
          `[Game Window] Handler ${handler.name} skipped: Missing required context.`,
        );
        continue;
      }
      // Note: If handler.triggeredBy is undefined, it's global.

      logger.log(`[Game Window] Matched Handler: ${handler.name}`);
      diagnosticHandler = handler.name;
      diagnosePage("page.dispatch", { trigger: triggerContext });

      // 1. Check Visibility Requirement
      const shouldShowOnMatch = shouldRequestVisibilityOnHandlerMatch(
        handler.visibility,
        isValidationMode,
      );

      if (shouldShowOnMatch) {
        logger.log(
          `[Game Window] Visibility required by ${handler.name}. Requesting show...`,
        );
        requestWindowVisibility(true);
      } else {
        // [Refinement] Explicitly un-force if not required (always un-force if in validation mode)
        requestWindowVisibility(false);
      }

      // Apply the new document's policy before a handler can navigate or await input.
      const timeout = handler.timeoutMs ?? 10000;
      sendPageMessage(
        isValidationMode
          ? "account:update-timeout"
          : "automation:update-timeout",
        timeout,
      );

      // 2. Execute Handler with Context
      try {
        const context: HandlerContext = {
          setVisible: (visible: boolean) => {
            requestWindowVisibility(visible);
          },
          getCurrentUrl: () => window.location.href,
        };
        await handler.execute(context);
      } catch (e) {
        reportAutomationFailure(handler.name, e);
        return;
      }

      return;
    }
  }

  // [New] Exceptional UI capture: Force show and log error if no handler matches during game start.
  // This ensures that unexpected pages (maintenance, extra redirects) are visible to the user.
  if (shouldRevealUnhandledAutomatedPage(triggerContext, currentUrl.href)) {
    const initialHref = currentUrl.href;

    logger.warn(
      `[Game Window] Unhandled page candidate during automated flow: ${initialHref}. Waiting ${UNHANDLED_PAGE_REVEAL_DELAY_MS}ms before showing.`,
    );

    automationClock.setTimeout(() => {
      if (window.location.href !== initialHref) {
        logger.log(
          `[Game Window] Unhandled page reveal skipped: URL changed from ${initialHref} to ${window.location.href}.`,
        );
        return;
      }

      logger.error(
        `[Game Window] UNHANDLED PAGE DETECTED during automated flow: ${initialHref}`,
      );
      // Explicitly bypass local visibility helpers and force main process to show
      sendPageMessage("window-visibility-request", true);
    }, UNHANDLED_PAGE_REVEAL_DELAY_MS);
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

ipcRenderer.on("kakao:page-resumed", () => {
  automationClock.resume();
  diagnosePage("page.resumed");
  if (pageDeferred) void dispatchPageLogic();
});

ipcRenderer.on("kakao:page-paused", () => {
  automationClock.pause();
  diagnosePage("page.paused");
});

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

window.addEventListener("DOMContentLoaded", async () => {
  logger.log("[Game Window] DOMContentLoaded");

  // 1. Fetch navigation purpose from Main process
  const triggerContext = await ipcRenderer.invoke(
    "account:get-trigger-context",
  );

  // 2. Derive validation mode from context (Immutable for this window's life)
  isValidationMode = triggerContext === "ACCOUNT_VALIDATION";

  if (isValidationMode) {
    logger.log("[Game Window] Background validation mode ACTIVE.");
  }

  await dispatchPageLogic(triggerContext);
});

logger.log("[Game Window] Preload Loaded");
