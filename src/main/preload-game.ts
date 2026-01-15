import { ipcRenderer } from 'electron'

// DOM Selectors (Compatible with Plugin)
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
    }
}

function safeClick(element: HTMLElement | null) {
    if (element) {
        element.click();
        return true;
    }
    return false;
}

function executeGameStart() {
    console.log('[Game Window] Received execute-game-start command');

    // 1. Handle Intro Modal (Today Close / Close X)
    const introContent = document.getElementById(SELECTORS.POE2.INTRO_MODAL_ID);
    if (introContent) {
        const container = introContent.closest(SELECTORS.POE2.MODAL_CONTAINER);
        if (container && (container as HTMLElement).offsetParent !== null) {
            const todayBtn = container.querySelector(SELECTORS.POE2.BTN_TODAY_CLOSE);
            if (!safeClick(todayBtn as HTMLElement)) {
                const closeBtn = container.querySelector(SELECTORS.POE2.BTN_CLOSE_X);
                safeClick(closeBtn as HTMLElement);
            }
            console.log('[Game Window] Dismissed Intro Modal');
        }
    }

    // 2. Click Game Start Button on Main Page
    const startBtn = document.querySelector(SELECTORS.POE2.BTN_GAME_START);
    if (safeClick(startBtn as HTMLElement)) {
        console.log('[Game Window] Clicked Main Page Game Start Button');
        return;
    }

    // 3. Fallback: Search for Launcher Game Start Buttons (if redirected to launcher page)
    for (const selector of SELECTORS.LAUNCHER.GAME_START_BUTTONS) {
        const btn = document.querySelector(selector);
        if (safeClick(btn as HTMLElement)) {
             console.log(`[Game Window] Clicked Launcher Button: ${selector}`);
             return;
        }
    }

    console.warn('[Game Window] No Game Start Button found');
}

// Listen for commands from Main Process
ipcRenderer.on('execute-game-start', () => {
    executeGameStart();
});

console.log('[Game Window] Preload Loaded');
