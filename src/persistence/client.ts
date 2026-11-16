import { parseSave, parseSaveText } from './validation';
import type { Snapshot } from './queue';
import { SaveFailure } from './queue';
export const SAVE_KEY = 'simplayz.save.v4';
export async function readRemote() {
  const res = await fetch('/api/game', { cache: 'no-store', signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error('Unable to load server save. Retry; no progress has been replaced.');
  const data = await res.json();
  if (!Number.isSafeInteger(data.revision) || data.revision < 0) throw new Error('Invalid save revision.');
  return { state: data.state === null ? null : parseSave(data.state), revision: data.revision as number };
}
export async function writeRemote(state: Snapshot, revision: number) {
  const res = await fetch('/api/game', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, revision }), signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new SaveFailure(res.status);
  const data = await res.json();
  if (!Number.isSafeInteger(data.revision) || data.revision !== revision + 1) throw new SaveFailure(503);
  return data.revision as number;
}
export function exportSave(state: unknown) {
  const clean = parseSave(state);
  const url = URL.createObjectURL(new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'simplayz-save.json'; a.click(); URL.revokeObjectURL(url);
}
export function legacySave(raw: string) { return parseSaveText(raw); }
// Also clean malformed legacy JSON before leaving it on disk for manual recovery.
export function redactLegacy(raw: string) {
  return JSON.stringify(JSON.parse(raw, (key, value) => /apikey|api_key|authorization|password|secret|token/i.test(key) ? undefined : value));
}
