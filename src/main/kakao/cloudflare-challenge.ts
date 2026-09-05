import { isKakaoPoeHomeUrl } from "../../shared/kakao-url-policy";

interface Request {
  id: number;
  webContentsId?: number;
  url: string;
  resourceType: string;
}

interface WindowState {
  trigger: string;
  task: number;
  challenge: boolean;
  visible: boolean;
  revealTimer?: ReturnType<typeof setTimeout>;
  documentId: number | null;
  committed: { challenge: boolean; documentId: number | null };
  request?: { id: number; response?: { url: string; challenge: boolean } };
}

const TRIGGERS = new Set([
  "ACCOUNT_VALIDATION",
  "ACCOUNT_MANUAL_LOGIN",
  "GAME_START_POE1",
  "GAME_START_POE2",
]);

export const CLOUDFLARE_REVEAL_DELAY_MS = 5000;

function documentUrl(value: string) {
  return value.split("#")[0];
}

/** Main owns challenge state; neither a preload hide request nor a redirect releases it. */
export class KakaoChallengeGate {
  private windows = new Map<number, WindowState>();
  private retired = new Set<number>();
  private sequence = 0;

  constructor(
    private readonly onChallenge: (id: number) => void,
    private readonly onResumed: (ids: number[]) => void = () => {},
    private readonly onRetired: (
      ids: number[],
      successorId: number,
    ) => void = () => {},
    private readonly onReveal: (id: number) => void = () => {},
  ) {}

  setTrigger(id: number, trigger: string | null, parentId?: number) {
    if (!trigger || !TRIGGERS.has(trigger)) {
      this.remove(id);
      return;
    }
    const oldTask = this.windows.get(id)?.task;
    if (parentId === undefined && oldTask !== undefined) {
      const retired: number[] = [];
      for (const [windowId, state] of this.windows) {
        if (state.task === oldTask) {
          this.cancelReveal(state);
          this.windows.delete(windowId);
          this.retired.add(windowId);
          if (windowId !== id) retired.push(windowId);
        }
      }
      this.onRetired(retired, id);
    }
    const previous = this.windows.get(id);
    if (previous) this.cancelReveal(previous);
    this.retired.delete(id);
    this.windows.set(id, {
      trigger,
      task:
        (parentId === undefined
          ? undefined
          : this.windows.get(parentId)?.task) ?? ++this.sequence,
      challenge: false,
      visible: false,
      documentId: null,
      committed: { challenge: false, documentId: null },
    });
  }

  beginNavigation(id: number) {
    const state = this.windows.get(id);
    if (!state) return;
    state.documentId = null;
    state.request = undefined;
  }

  requestStarted(details: Request) {
    if (details.resourceType !== "mainFrame") return;
    const state = this.windows.get(details.webContentsId ?? -1);
    if (!state) return;
    state.request = { id: details.id };
  }

  responseStarted(
    details: Request & {
      statusCode: number;
      responseHeaders?: Record<string, string[]>;
    },
  ) {
    if (details.resourceType !== "mainFrame") return;
    const id = details.webContentsId ?? -1;
    const state = this.windows.get(id);
    if (!state?.request || state.request.id !== details.id) return;
    // Redirect headers are not a committed document (including challenge redirects).
    if (details.statusCode >= 300 && details.statusCode < 400) return;
    let challenge = false;
    try {
      const url = new URL(details.url);
      challenge =
        url.protocol === "https:" &&
        isKakaoPoeHomeUrl(url) &&
        Object.entries(details.responseHeaders ?? {}).some(
          ([name, values]) =>
            name.toLowerCase() === "cf-mitigated" &&
            values.some((value) => value.trim().toLowerCase() === "challenge"),
        );
    } catch {
      /* A malformed URL cannot authorize showing a window. */
    }
    state.request.response = { url: documentUrl(details.url), challenge };
    if (challenge && !state.challenge) {
      state.challenge = true;
      state.revealTimer = setTimeout(() => {
        state.revealTimer = undefined;
        if (this.windows.get(id) !== state || !state.challenge) return;
        state.visible = true;
        this.onReveal(id);
      }, CLOUDFLARE_REVEAL_DELAY_MS);
      this.onChallenge(id);
    }
  }

  requestFailed(details: { id: number; webContentsId?: number }) {
    const state = this.windows.get(details.webContentsId ?? -1);
    if (state?.request?.id !== details.id) return;
    state.request = undefined;
    const wasChallenged = state.challenge;
    state.challenge = state.committed.challenge;
    state.documentId = state.committed.documentId;
    if (!state.challenge) this.cancelReveal(state);
    if (wasChallenged && !state.challenge) this.resumeTask(state.task);
  }

  commit(id: number, url: string) {
    const state = this.windows.get(id);
    if (!state) return;
    const response = state.request?.response;
    const wasChallenged = state.challenge;
    if (response?.url === documentUrl(url))
      state.challenge = response.challenge;
    state.documentId = ++this.sequence;
    state.committed = {
      challenge: state.challenge,
      documentId: state.documentId,
    };
    if (!state.challenge) this.cancelReveal(state);
    if (wasChallenged && !state.challenge) this.resumeTask(state.task);
  }

  remove(id: number) {
    const state = this.windows.get(id);
    if (state) this.cancelReveal(state);
    this.windows.delete(id);
    this.retired.delete(id);
    if (state?.challenge) this.resumeTask(state.task);
  }

  private cancelReveal(state: WindowState) {
    clearTimeout(state.revealTimer);
    state.revealTimer = undefined;
    state.visible = false;
  }

  private resumeTask(task: number) {
    const members = [...this.windows].filter(
      ([, state]) => state.task === task,
    );
    if (!members.some(([, state]) => state.challenge))
      this.onResumed(members.map(([id]) => id));
  }

  isVisible(id: number) {
    return this.windows.get(id)?.visible === true;
  }

  taskBlocked(id: number) {
    const task = this.windows.get(id)?.task;
    return (
      task !== undefined &&
      [...this.windows.values()].some(
        (state) => state.task === task && state.challenge,
      )
    );
  }

  taskMembers(id: number) {
    const task = this.windows.get(id)?.task;
    return [...this.windows]
      .filter(([, state]) => state.task === task)
      .map(([id]) => id);
  }

  hasChallenge(trigger: string) {
    return [...this.windows.values()].some(
      (state) => state.trigger === trigger && state.challenge,
    );
  }

  pageState(id: number) {
    const state = this.windows.get(id);
    return {
      blocked:
        this.retired.has(id) ||
        this.taskBlocked(id) ||
        (state !== undefined && state.documentId === null),
      documentId: state?.documentId ?? null,
    };
  }

  accepts(id: number, documentId: number | null | undefined) {
    const page = this.pageState(id);
    return !page.blocked && page.documentId === documentId;
  }

  /** Read-only snapshot; diagnostics never authorize or restore a document. */
  diagnosticState(id: number, receivedDocumentId?: number | null) {
    const state = this.windows.get(id);
    const retired = this.retired.has(id);
    const taskBlocked = this.taskBlocked(id);
    const page = this.pageState(id);
    const reason = retired
      ? "retired"
      : taskBlocked
        ? "task-challenged"
        : state && state.documentId === null
          ? "document-uncommitted"
          : page.documentId !== receivedDocumentId
            ? "document-mismatch"
            : "accepted";
    return {
      tracked: Boolean(state),
      retired,
      taskId: state?.task ?? null,
      trigger: state?.trigger,
      gateDocumentId: page.documentId,
      committedDocumentId: state?.committed.documentId ?? null,
      requestId: state?.request?.id ?? null,
      challenge: state?.challenge ?? false,
      taskBlocked,
      revealPending: state?.revealTimer !== undefined,
      reason,
    };
  }
}
