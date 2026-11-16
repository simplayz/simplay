export type AutosavePhase = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

export interface AutosaveStatus {
  phase: AutosavePhase;
  revision: number;
  error?: string;
  conflict?: { currentRevision: number; currentUpdatedAt?: number };
  lastSavedAt?: number;
}

export type AutosaveWriteResult =
  | { ok: true; revision: number; savedAt?: number }
  | { ok: false; kind: "conflict"; currentRevision: number; currentUpdatedAt?: number }
  | { ok: false; kind: "error"; message: string };

interface TimerApi {
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
  now: () => number;
}

export interface AutosaveOptions<T> {
  initialRevision: number;
  maxWaitMs?: number;
  promptDelayMs?: number;
  write: (snapshot: T, revision: number) => Promise<AutosaveWriteResult>;
  onChange?: (status: AutosaveStatus) => void;
  timers?: Partial<TimerApi>;
}

/**
 * Serialises saves and coalesces rapid simulation ticks. At most one write is
 * in flight; while play continues the pending snapshot is replaced and the
 * next write starts no later than maxWaitMs after the previous attempt.
 */
export class AutosaveController<T> {
  private pending: T | null = null;
  private revision: number;
  private phase: AutosavePhase = "idle";
  private error: string | undefined;
  private conflict: AutosaveStatus["conflict"];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerDueAt = 0;
  private inFlight = false;
  private paused = false;
  private lastAttemptAt = 0;
  private lastSavedAt: number | undefined;
  private idleWaiters: (() => void)[] = [];
  private disposed = false;
  private readonly maxWaitMs: number;
  private readonly promptDelayMs: number;
  private readonly timers: TimerApi;

  constructor(private readonly options: AutosaveOptions<T>) {
    this.revision = options.initialRevision;
    this.maxWaitMs = options.maxWaitMs ?? 5_000;
    this.promptDelayMs = options.promptDelayMs ?? 400;
    this.timers = {
      // Browser timer functions throw "Illegal invocation" when called with an
      // arbitrary `this`. Wrap them so the controller can call them as methods.
      setTimeout: (fn, ms) => (options.timers?.setTimeout ?? setTimeout)(fn, ms),
      clearTimeout: (handle) => (options.timers?.clearTimeout ?? clearTimeout)(handle),
      now: options.timers?.now ?? Date.now,
    };
  }

  getStatus(): AutosaveStatus {
    return {
      phase: this.phase,
      revision: this.revision,
      error: this.error,
      conflict: this.conflict,
      lastSavedAt: this.lastSavedAt,
    };
  }

  getRevision(): number {
    return this.revision;
  }

  getPending(): T | null {
    return this.pending;
  }

  hasPending(): boolean {
    return this.pending !== null;
  }

  isBusy(): boolean {
    return this.inFlight;
  }

  /** Resolves after the write currently in flight settles. */
  whenIdle(): Promise<void> {
    if (!this.inFlight) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  lastSaved(): number | undefined {
    return this.lastSavedAt;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.clearTimer();
    } else if (this.pending && this.phase !== "conflict" && !this.inFlight) {
      this.schedule(this.promptDelayMs);
    }
  }

  markDirty(snapshot: T, prompt = false): void {
    if (this.disposed) return;
    this.pending = snapshot;
    if (this.phase === "conflict" || this.phase === "error" || this.paused) {
      return;
    }
    if (this.phase !== "saving") {
      this.phase = "dirty";
      this.error = undefined;
      this.emit();
    }
    if (this.inFlight) return;

    const now = this.timers.now();
    if (this.lastAttemptAt === 0) {
      this.schedule(prompt ? this.promptDelayMs : this.maxWaitMs);
      return;
    }
    const nextDue = prompt
      ? Math.min(now + this.promptDelayMs, this.lastAttemptAt + this.maxWaitMs)
      : this.lastAttemptAt + this.maxWaitMs;
    this.schedule(Math.max(0, nextDue - now));
  }

  markSaved(revision = this.revision, savedAt = this.timers.now()): void {
    this.clearTimer();
    this.pending = null;
    this.revision = revision;
    this.inFlight = false;
    this.error = undefined;
    this.conflict = undefined;
    this.phase = "saved";
    this.lastSavedAt = savedAt;
    this.emit();
  }

  acceptServerRevision(revision: number): void {
    this.revision = revision;
    this.error = undefined;
    this.conflict = undefined;
    if (this.pending) {
      this.phase = "dirty";
      this.emit();
      this.schedule(0);
    } else {
      this.phase = "saved";
      this.emit();
    }
  }

  /**
   * Drops the pending snapshot and adopts the server revision. Used when the
   * player explicitly chooses the server copy after a conflict.
   */
  discardAndAcceptRevision(revision: number, savedAt = this.timers.now()): void {
    this.clearTimer();
    this.pending = null;
    this.revision = revision;
    this.inFlight = false;
    this.error = undefined;
    this.conflict = undefined;
    this.phase = "saved";
    this.lastSavedAt = savedAt;
    this.emit();
  }

  retry(): void {
    if (!this.pending || this.inFlight || this.disposed) return;
    this.error = undefined;
    this.conflict = undefined;
    this.phase = "dirty";
    this.emit();
    this.schedule(0);
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  private emit(): void {
    this.options.onChange?.(this.getStatus());
  }

  private schedule(delay: number): void {
    if (this.disposed) return;
    const due = this.timers.now() + delay;
    if (this.timer && this.timerDueAt <= due) return;
    this.clearTimer();
    this.timerDueAt = due;
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      this.timerDueAt = 0;
      void this.pump();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer) {
      this.timers.clearTimeout(this.timer);
      this.timer = null;
      this.timerDueAt = 0;
    }
  }

  private async pump(): Promise<void> {
    if (this.disposed || this.inFlight || this.paused || this.phase === "conflict" || this.pending === null) {
      return;
    }
    const snapshot = this.pending;
    this.pending = null;
    this.inFlight = true;
    this.lastAttemptAt = this.timers.now();
    this.phase = "saving";
    this.error = undefined;
    this.emit();

    let result: AutosaveWriteResult;
    try {
      result = await this.options.write(snapshot, this.revision);
    } catch (error) {
      result = {
        ok: false,
        kind: "error",
        message: error instanceof Error ? error.message : "Save failed",
      };
    }
    this.inFlight = false;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();

    if (result.ok) {
      this.revision = result.revision;
      this.lastSavedAt = result.savedAt ?? this.timers.now();
      this.conflict = undefined;
      this.error = undefined;
      if (this.pending === null) {
        this.phase = "saved";
        this.emit();
      } else {
        this.phase = "dirty";
        this.emit();
        const due = this.lastAttemptAt + this.maxWaitMs;
        this.schedule(Math.max(0, due - this.timers.now()));
      }
      return;
    }

    if (result.kind === "conflict") {
      if (this.pending === null) this.pending = snapshot;
      this.phase = "conflict";
      this.conflict = {
        currentRevision: result.currentRevision,
        currentUpdatedAt: result.currentUpdatedAt,
      };
      this.emit();
      return;
    }

    if (this.pending === null) this.pending = snapshot;
    this.phase = "error";
    this.error = result.message;
    this.emit();
    // Keep trying while play continues; the retry button can force an earlier
    // attempt, and conflict recovery remains explicit.
    if (!this.paused) this.schedule(this.maxWaitMs);
  }
}

export const AUTOSAVE_MAX_WAIT_MS = 5_000;
export const AUTOSAVE_PROMPT_DELAY_MS = 400;
