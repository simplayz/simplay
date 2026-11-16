import { describe, expect, it } from "vitest";
import {
  AutosaveController,
  type AutosaveStatus,
  type AutosaveWriteResult,
} from "@/lib/autosave";

interface WriteCall {
  snapshot: string;
  revision: number;
  resolve: (result: AutosaveWriteResult) => void;
}

class ManualClock {
  now = 0;
  private nextId = 1;
  private tasks = new Map<number, { at: number; fn: () => void }>();

  setTimeout = (fn: () => void, ms: number): ReturnType<typeof setTimeout> => {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.now + ms, fn });
    return id as unknown as ReturnType<typeof setTimeout>;
  };

  clearTimeout = (handle: ReturnType<typeof setTimeout>): void => {
    this.tasks.delete(handle as unknown as number);
  };

  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      let next: [number, { at: number; fn: () => void }] | undefined;
      for (const entry of this.tasks) {
        if (entry[1].at > target) continue;
        if (!next || entry[1].at < next[1].at) next = entry;
      }
      if (!next) break;
      this.tasks.delete(next[0]);
      this.now = next[1].at;
      next[1].fn();
    }
    this.now = target;
  }
}

function flush(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

function makeController(clock: ManualClock) {
  const writes: WriteCall[] = [];
  const statuses: AutosaveStatus[] = [];
  const controller = new AutosaveController<string>({
    initialRevision: 0,
    maxWaitMs: 5_000,
    promptDelayMs: 300,
    timers: {
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
      now: () => clock.now,
    },
    write: (snapshot, revision) =>
      new Promise<AutosaveWriteResult>((resolve) => {
        writes.push({ snapshot, revision, resolve });
      }),
    onChange: (status) => statuses.push(status),
  });
  return { controller, writes, statuses };
}

describe("AutosaveController", () => {
  it("serialises writes, coalesces ticks, and starts at most every five seconds", async () => {
    const clock = new ManualClock();
    const { controller, writes, statuses } = makeController(clock);

    controller.markDirty("a");
    clock.advance(4_999);
    expect(writes).toHaveLength(0);
    clock.advance(1);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ snapshot: "a", revision: 0 });
    expect(controller.getStatus().phase).toBe("saving");

    controller.markDirty("b");
    controller.markDirty("c");
    expect(writes).toHaveLength(1);
    expect(controller.getPending()).toBe("c");

    writes[0]!.resolve({ ok: true, revision: 1 });
    await flush();
    expect(controller.getStatus()).toMatchObject({ phase: "dirty", revision: 1 });

    clock.advance(4_999);
    expect(writes).toHaveLength(1);
    clock.advance(1);
    expect(writes).toHaveLength(2);
    expect(writes[1]).toMatchObject({ snapshot: "c", revision: 1 });

    writes[1]!.resolve({ ok: true, revision: 2 });
    await flush();
    expect(controller.getStatus()).toMatchObject({ phase: "saved", revision: 2 });
    expect(statuses.some((s) => s.phase === "saving")).toBe(true);
  });

  it("uses the prompt delay for actions after the first attempt", () => {
    const clock = new ManualClock();
    const { controller, writes } = makeController(clock);
    controller.markDirty("tick-0");
    clock.advance(5_000);
    writes[0]!.resolve({ ok: true, revision: 1 });
    return flush().then(() => {
      clock.advance(1_000);
      controller.markDirty("action", true);
      clock.advance(299);
      expect(writes).toHaveLength(1);
      clock.advance(1);
      expect(writes).toHaveLength(2);
      expect(writes[1]).toMatchObject({ snapshot: "action", revision: 1 });
    });
  });

  it("stops at a conflict until a revision is explicitly adopted", async () => {
    const clock = new ManualClock();
    const { controller, writes } = makeController(clock);
    controller.markDirty("local");
    clock.advance(5_000);
    writes[0]!.resolve({ ok: false, kind: "conflict", currentRevision: 7, currentUpdatedAt: 123 });
    await flush();

    expect(controller.getStatus()).toMatchObject({
      phase: "conflict",
      conflict: { currentRevision: 7, currentUpdatedAt: 123 },
    });
    controller.markDirty("newer-local");
    clock.advance(60_000);
    expect(writes).toHaveLength(1);

    controller.acceptServerRevision(7);
    clock.advance(0);
    expect(writes).toHaveLength(2);
    expect(writes[1]).toMatchObject({ snapshot: "newer-local", revision: 7 });
    writes[1]!.resolve({ ok: true, revision: 8 });
    await flush();
    expect(controller.getStatus()).toMatchObject({ phase: "saved", revision: 8 });
  });

  it("retains the snapshot and retries after a network failure", async () => {
    const clock = new ManualClock();
    const { controller, writes } = makeController(clock);
    controller.markDirty("snapshot");
    clock.advance(5_000);
    writes[0]!.resolve({ ok: false, kind: "error", message: "offline" });
    await flush();
    expect(controller.getStatus()).toMatchObject({ phase: "error", error: "offline" });
    expect(controller.getPending()).toBe("snapshot");

    clock.advance(5_000);
    expect(writes).toHaveLength(2);
    expect(writes[1]).toMatchObject({ snapshot: "snapshot", revision: 0 });
    writes[1]!.resolve({ ok: true, revision: 1 });
    await flush();
    expect(controller.getStatus()).toMatchObject({ phase: "saved", revision: 1 });
  });

  it("drops pending state when the player explicitly adopts the server copy", async () => {
    const clock = new ManualClock();
    const { controller, writes } = makeController(clock);
    controller.markDirty("local");
    clock.advance(5_000);
    writes[0]!.resolve({ ok: false, kind: "conflict", currentRevision: 4 });
    await flush();

    controller.discardAndAcceptRevision(4);
    expect(controller.getPending()).toBeNull();
    clock.advance(60_000);
    expect(writes).toHaveLength(1);
    expect(controller.getStatus()).toMatchObject({ phase: "saved", revision: 4 });
  });

  it("exposes whenIdle for reset/reload coordination", async () => {
    const clock = new ManualClock();
    const { controller, writes } = makeController(clock);
    controller.markDirty("snapshot");
    clock.advance(5_000);

    let idle = false;
    const waiting = controller.whenIdle().then(() => {
      idle = true;
    });
    expect(idle).toBe(false);
    writes[0]!.resolve({ ok: true, revision: 1 });
    await waiting;
    expect(idle).toBe(true);
  });
});
