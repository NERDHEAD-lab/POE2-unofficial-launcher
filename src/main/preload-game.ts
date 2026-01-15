import { ipcRenderer } from 'electron'

// DOM Selectors (Strictly aligned with POE2-quick-launch-for-kakao/src/domSelectors.ts)
const SELECTORS = {
    POE2: {
        MODAL_CONTAINER: '.modal__container',
        INTRO_MODAL_ID: 'kgIntroModalContents',
        BTN_TODAY_CLOSE: '.modal__button-block',
        BTN_CLOSE_X: '.modal__button-x',
        BTN_GAME_START: '.main-start__link'
    },
    LAUNCHER: {
        GAME_START_BUTTONS: [
            '#gameStart', 
            '.btn-start-game',
            'span.btn_g',
            '.popup__link--confirm'
        ],
        LOGIN_REQUIRED_TEXTS: ['로그인이 필요한 서비스', '로그인 하시겠습니까'],
        BTN_CONFIRM: '.popup__link--confirm'
    },
    SECURITY: {
        CONFIRM_BUTTONS: ['a', 'button', 'span.btn_g', '.popup__link--confirm', '.btn-confirm'],
        BTN_DESIGNATED_CONFIRM: '.btn-confirm',
        BTN_POPUP_CONFIRM: '.popup__link--confirm',
        PC_INFO_BTN_ATTR: '[ganame="PC정보수집안내_확인_버튼"]' // From User Screenshot (Specific Exception)
    },
    LOGIN_DAUM: {
        BTN_KAKAO_LOGIN: '.login__container--btn-kakao',
        // Fallback for different layouts (legacy)
        BTN_KAKAO_LEGACY: '.link_kakao_login'
    },
    KAKAO_AUTH: {
        BTN_AGREE: '.btn_agree, button[type="submit"].btn_g'
    }
}

// Refined safeClick based on dom.ts
function safeClick(element: HTMLElement | null) {
    if (!element) return false;

    try {
        if (
            element instanceof HTMLAnchorElement &&
            element.href.toLowerCase().startsWith('javascript:')
        ) {
            console.log('[Game Window] Detecting javascript: href, dispatching custom click event.');
            const event = new MouseEvent('click', {
                bubbles: true,
                cancelable: true
            });
            event.preventDefault(); // CSP Bypass: Stop navigation but allow site-listeners to fire
            element.dispatchEvent(event);
            return true;
        }

        if (typeof element.click === 'function') {
            console.log('[Game Window] Performing native .click()');
            element.click();
            return true;
        }

        console.log('[Game Window] Native click not function, dispatching event.');
        const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true
        });
        element.dispatchEvent(event);
        return true;
    } catch (err) {
        console.error('[Game Window] safeClick failed:', err);
        return false;
    }
}

function executeGameStart() {
    console.log('[Game Window] Received execute-game-start command');

    // Helper to run steps in sequence
    const runSequence = async () => {
        // 1. Handle Intro Modal
        const cookies = document.cookie.split(';').reduce((acc, cookie) => {
            const [name, value] = cookie.trim().split('=');
            acc[name] = value;
            return acc;
        }, {} as Record<string, string>);

        if (cookies['POE2_INTRO_MODAL'] === '1') {
            console.log('[Game Window] Intro Modal cookie present (Value: 1), skipping close logic.');
        } else {
            const introContent = document.getElementById(SELECTORS.POE2.INTRO_MODAL_ID);
            if (introContent) {
                const container = introContent.closest(SELECTORS.POE2.MODAL_CONTAINER);
                if (container && (container as HTMLElement).offsetParent !== null) {
                    const closeBtn = container.querySelector(SELECTORS.POE2.BTN_CLOSE_X);
                    if (safeClick(closeBtn as HTMLElement)) {
                         console.log('[Game Window] Clicked "Close X" Button');
                    } else {
                        const todayBtn = container.querySelector(SELECTORS.POE2.BTN_TODAY_CLOSE);
                        safeClick(todayBtn as HTMLElement);
                    }
    
                    console.log('[Game Window] Dismissed Intro Modal');
                    await new Promise(r => setTimeout(r, 500));
                }
            } else {
                console.log('[Game Window] Intro Modal not found (DOM).');
            }
        }

        // 2. Click Game Start Button on Main Page
        const startBtn = document.querySelector(SELECTORS.POE2.BTN_GAME_START);
        if (startBtn) {
             console.log('[Game Window] Found Start Button. Href:', (startBtn as HTMLAnchorElement).href);
        }

        if (safeClick(startBtn as HTMLElement)) {
            console.log('[Game Window] Clicked Main Page Game Start Button');
            return;
        }

        // 3. Fallback: Search for Launcher Game Start Buttons
        for (const selector of SELECTORS.LAUNCHER.GAME_START_BUTTONS) {
            const btn = document.querySelector(selector);
            if (safeClick(btn as HTMLElement)) {
                 console.log(`[Game Window] Clicked Launcher Button via Selector: ${selector}`);
                 return;
            }
        }

        console.warn('[Game Window] No Game Start Button found (Checked Strict Selectors Only)');
    };

    runSequence().catch(err => console.error('[Game Window] Error during game start sequence:', err));
}

// --- Utils (Ported from dom.ts) ---

function observeAndInteract(
    checkFn: (obs?: MutationObserver) => boolean,
    timeoutMs: number = 10000
) {
    if (checkFn()) return;

    console.log('[Game Window] Target not found immediately. Starting observer...');

    const observer = new MutationObserver((_mutations, obs) => {
        if (checkFn(obs)) {
             // checkFn handles disconnect usually, but safety check
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    if (timeoutMs > 0) {
        setTimeout(() => {
            observer.disconnect();
            console.log('[Game Window] Observer timed out.');
        }, timeoutMs);
    }
}

// --- Page Handlers (Ported from content.ts strictly) ---

const LauncherCheckHandler = {
    name: 'LauncherCheckHandler',
    match: (url: URL) => {
        return url.hostname === 'pubsvc.game.daum.net' && 
               (url.pathname.includes('/gamestart/poe.html') || url.pathname.includes('/gamestart/poe2.html'));
    },
    execute: () => {
        console.log('[Handler] LauncherCheckHandler Logic Started');
        observeAndInteract((obs) => {
            // Check for Login Required Popup Content (Text Search allowed here per user request)
            const bodyText = document.body.innerText;
            if (SELECTORS.LAUNCHER.LOGIN_REQUIRED_TEXTS.some(text => bodyText.includes(text))) {
                 console.log('[Handler] Login Check: Login Required Detected.');
                 const confirmBtn = document.querySelector(SELECTORS.LAUNCHER.BTN_CONFIRM);
                 
                 if (safeClick(confirmBtn as HTMLElement)) {
                     console.log('[Handler] Clicked Confirm (Login Required).');
                     if (obs) obs.disconnect();
                     return true;
                  }
            }
            return false;
        });
    }
};

const DaumLoginHandler = {
    name: 'DaumLoginHandler',
    match: (url: URL) => url.hostname === 'logins.daum.net',
    execute: () => {
        console.log('[Handler] DaumLoginHandler Logic Started');
        observeAndInteract((obs) => {
            const selectors = [
                SELECTORS.LOGIN_DAUM.BTN_KAKAO_LOGIN, 
                SELECTORS.LOGIN_DAUM.BTN_KAKAO_LEGACY
            ];

            for (const sel of selectors) {
                const btn = document.querySelector(sel);
                if (safeClick(btn as HTMLElement)) {
                    console.log(`[Handler] Clicked Kakao Login via ${sel}`);
                    if (obs) obs.disconnect();
                    return true;
                }
            }
            return false;
        });
    }
};

const KakaoAuthHandler = {
    name: 'KakaoAuthHandler',
    match: (url: URL) => url.hostname === 'kauth.kakao.com' && url.pathname.includes('/oauth/authorize'),
    execute: () => {
        console.log('[Handler] KakaoAuthHandler Logic Started');
        observeAndInteract((obs) => {
            const agreeBtn = document.querySelector(SELECTORS.KAKAO_AUTH.BTN_AGREE);
            if (safeClick(agreeBtn as HTMLElement)) {
                console.log('[Handler] Clicked Agree/Continue');
                if (obs) obs.disconnect();
                return true;
            }
            return false;
        });
    }
};

const SecurityCenterHandler = {
    name: 'SecurityCenterHandler',
    match: (url: URL) => url.hostname === 'security-center.game.daum.net',
    execute: () => {
        console.log('[Handler] SecurityCenterHandler Logic Started');
        observeAndInteract((obs) => {
             // 1. Precise Attribute Selector (From User Screenshot)
             if (safeClick(document.querySelector(SELECTORS.SECURITY.PC_INFO_BTN_ATTR) as HTMLElement)) {
                 console.log('[Handler] Clicked Dedicated PC Confirm (Attribute Match).');
                 if (obs) obs.disconnect();
                 return true;
             }

             // 2. Class Selector (From domSelectors.ts)
             if (safeClick(document.querySelector(SELECTORS.SECURITY.BTN_DESIGNATED_CONFIRM) as HTMLElement)) {
                 console.log('[Handler] Clicked Designated PC Confirm (Class Match).');
                 if (obs) obs.disconnect();
                 return true;
             }
             
             // 3. Generic Popup Confirm
             if (safeClick(document.querySelector(SELECTORS.SECURITY.BTN_POPUP_CONFIRM) as HTMLElement)) {
                 console.log('[Handler] Clicked Generic Security Confirm.');
                 if (obs) obs.disconnect();
                 return true;
             }
             return false;
        });
    }
};

const LauncherCompletionHandler = {
    name: 'LauncherCompletionHandler',
    match: (url: URL) => url.hostname === 'pubsvc.game.daum.net' && url.pathname.includes('/completed.html'),
    execute: () => {
         console.log('[Handler] LauncherCompletionHandler matched. Game Launched.');
         observeAndInteract((obs) => {
             // Strict Selectors Only - No Text Search
             for (const sel of SELECTORS.LAUNCHER.GAME_START_BUTTONS) {
                 const btn = document.querySelector(sel);
                 if (safeClick(btn as HTMLElement)) {
                     console.log(`[Handler] Clicked Game Start (${sel})`);
                     if (obs) obs.disconnect();
                     return true;
                 }
             }
             return false;
         });
    }
};

// Priority List
const HANDLERS = [
    LauncherCheckHandler,
    DaumLoginHandler,
    KakaoAuthHandler,
    SecurityCenterHandler,
    LauncherCompletionHandler
];

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
    
    console.warn('[Game Window] No specific handler matched!');
    console.log('[Game Window] Current Hostname:', currentUrl.hostname);
    console.log('[Game Window] Current Path:', currentUrl.pathname);
    console.log('[Game Window] Body Text Helper:', document.body.innerText.substring(0, 50).replace(/\n/g, ' '));
}

// Listen for commands from Main Process
ipcRenderer.on('execute-game-start', () => {
    console.log('[Game Window] IPC "execute-game-start" RECEIVED!');
    executeGameStart();
});

window.addEventListener('DOMContentLoaded', () => {
    console.log('[Game Window] DOMContentLoaded');
    document.body.style.border = '5px solid red'; // Debug Visual
    
    // 1. Dispatch Logic (Strict Match + Observer)
    dispatchPageLogic();

    // 2. Main Page Game Start Button Logic (Separate)
    if (window.location.hostname.includes('pathofexile2.game.daum.net')) {
         setTimeout(() => {
            const startBtn = document.querySelector(SELECTORS.POE2.BTN_GAME_START);
            console.log(`[Game Window] Main Page Start Button Check: ${!!startBtn}`);
        }, 2000);
    }
});

console.log('[Game Window] Preload Loaded Successfully');
