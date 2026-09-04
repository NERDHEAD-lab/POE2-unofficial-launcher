interface PendingTimer {
  callback: () => void;
  remaining: number;
  started: number;
  nativeId?: number;
}

/** Excludes manual verification time from this document's automation delays. */
export class AutomationClock {
  paused = false;
  private sequence = 0;
  private timers = new Map<number, PendingTimer>();
  private resumeListeners = new Set<() => void>();

  setTimeout(callback: () => void, delay: number): number {
    const id = ++this.sequence;
    const timer = { callback, remaining: delay, started: Date.now() };
    this.timers.set(id, timer);
    if (!this.paused) this.arm(id, timer);
    return id;
  }

  clearTimeout(id: number) {
    const timer = this.timers.get(id);
    if (timer?.nativeId !== undefined) window.clearTimeout(timer.nativeId);
    this.timers.delete(id);
  }

  private arm(id: number, timer: PendingTimer) {
    timer.started = Date.now();
    timer.nativeId = window.setTimeout(() => {
      this.timers.delete(id);
      timer.callback();
    }, timer.remaining);
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    for (const timer of this.timers.values()) {
      window.clearTimeout(timer.nativeId);
      timer.nativeId = undefined;
      timer.remaining = Math.max(
        0,
        timer.remaining - (Date.now() - timer.started),
      );
    }
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    for (const [id, timer] of this.timers) this.arm(id, timer);
    for (const listener of this.resumeListeners) listener();
  }

  onResume(listener: () => void) {
    this.resumeListeners.add(listener);
    return () => this.resumeListeners.delete(listener);
  }
}
