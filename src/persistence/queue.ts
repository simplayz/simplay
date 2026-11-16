import type { GameState } from '../game/types';
export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict';
export type Snapshot = GameState | null;
export class SaveFailure extends Error { constructor(public status: number) { super('Save failed'); } }
// Coalesced queue; ticks never reset the oldest pending deadline.
export class SaveQueue {
  revision: number;
  status: SaveStatus = 'saved';
  private pending: { state: Snapshot; sequence: number } | undefined;
  private sequence = 0;
  private inflight = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  constructor(revision: number, private write: (state: Snapshot, revision: number) => Promise<number>, private notify: (status: SaveStatus) => void, private committed: () => void = () => {}) { this.revision = revision; }
  private set(status: SaveStatus) { this.status = status; if (!this.disposed) this.notify(status); }
  enqueue(state: Snapshot, urgent = false) {
    this.pending = { state, sequence: ++this.sequence };
    if (this.status === 'error' || this.status === 'conflict' || this.disposed) return;
    if (!this.inflight) this.set('unsaved');
    if (urgent) { void this.flush(); return; }
    if (!this.timer) this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, 4000);
  }
  async flush() {
    if (this.timer) clearTimeout(this.timer); this.timer = undefined;
    if (this.disposed || this.inflight || !this.pending || this.status === 'error' || this.status === 'conflict') return;
    const item = this.pending; this.inflight = true; this.set('saving');
    try {
      this.revision = await this.write(item.state, this.revision);
      if (this.pending?.sequence === item.sequence) this.pending = undefined;
      if (!this.disposed) this.committed();
      this.set(this.pending ? 'unsaved' : 'saved');
    } catch (e) { this.set(e instanceof SaveFailure && e.status === 409 ? 'conflict' : 'error'); }
    finally {
      this.inflight = false;
      if (!this.disposed && this.pending && this.status === 'unsaved' && !this.timer) {
        this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, 500);
      }
    }
  }
  retry() { if (this.status === 'conflict') return; this.set('unsaved'); void this.flush(); }
  dispose() { this.disposed = true; if (this.timer) clearTimeout(this.timer); }
}
