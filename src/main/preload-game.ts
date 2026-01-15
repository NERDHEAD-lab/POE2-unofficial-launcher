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
    if (!element) return false;

    try {
        // 1. Try native click
        element.click();
        console.log('[Game Window] Clicked element:', element);
        return true;
    } catch (err) {
        console.warn('[Game Window] Native click failed, trying event dispatch:', err);
    }

    try {
        // 2. Try dispatching generic MouseEvents
        const event = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
        });
        element.dispatchEvent(event);
        return true;
    } catch (err) {
        console.error('[Game Window] All click attempts failed:', err);
        return false;
    }
}

function executeGameStart() {
    console.log('[Game Window] Received execute-game-start command');

    // Helper to run steps in sequence
    const runSequence = async () => {
        // 1. Handle Intro Modal
        // User Hint: Check cookie 'POE2_INTRO_MODAL' === '1'
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
                    // Prioritize 'Close X' button to avoid "focus" errors in site script
                    const closeBtn = container.querySelector(SELECTORS.POE2.BTN_CLOSE_X);
                    if (safeClick(closeBtn as HTMLElement)) {
                         console.log('[Game Window] Clicked "Close X" Button');
                    } else {
                        const todayBtn = container.querySelector(SELECTORS.POE2.BTN_TODAY_CLOSE);
                        safeClick(todayBtn as HTMLElement);
                    }
    
                    console.log('[Game Window] Dismissed Intro Modal');
                    // Wait for modal to disappear
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
             console.log('[Game Window] Found Start Button. OnClick:', (startBtn as HTMLElement).getAttribute('onclick'));
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

        // 4. Fallback: Search by Text Content
        const allButtons = Array.from(document.querySelectorAll('a, button, span, div.btn_start'));
        const textBtn = allButtons.find(el => {
            const text = (el as HTMLElement).innerText?.trim();
            return text === '게임시작' || text === 'GAME START' || text === 'Game Start';
        });

        if (safeClick(textBtn as HTMLElement)) {
            console.log(`[Game Window] Clicked Button via Text Content: "${(textBtn as HTMLElement).innerText}"`);
            return;
        }

        console.warn('[Game Window] No Game Start Button found (Checked Selectors & Text)');
    };

    runSequence().catch(err => console.error('[Game Window] Error during game start sequence:', err));
}

// Listen for commands from Main Process
ipcRenderer.on('execute-game-start', () => {
    console.log('[Game Window] IPC "execute-game-start" RECEIVED!');
    // alert('IPC Received: execute-game-start'); // Visual confirmation
    executeGameStart();
});

window.addEventListener('DOMContentLoaded', () => {
    console.log('[Game Window] DOMContentLoaded');
    // Visual Debugging: Red Border
    document.body.style.border = '5px solid red';
    
    // Auto-check for buttons on load
    setTimeout(() => {
        const startBtn = document.querySelector(SELECTORS.POE2.BTN_GAME_START);
        console.log(`[Game Window] Check on Load - Start Button found? ${!!startBtn}`);
    }, 2000);
});

console.log('[Game Window] Preload Loaded Successfully');
