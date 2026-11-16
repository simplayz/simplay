import 'server-only';
import { tokenHash, UnauthorizedError, type GameDatabase } from './database';
export const COOKIE = 'simplayz_session';
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function sameOrigin(req: Request, required = true) {
  const origin = req.headers.get('origin');
  if (req.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'Same-origin request required.');
  if (!origin && !required) return;
  try {
    const url = new URL(origin || '');
    if (url.host !== req.headers.get('host') || !['http:', 'https:'].includes(url.protocol)) throw new Error();
    const protocol = new URL(req.url).protocol;
    // TLS may terminate at the trusted hosting proxy. Host still must match.
    if (protocol === 'https:' && url.protocol !== 'https:') throw new Error();
  } catch { throw new HttpError(403, 'Same-origin request required.'); }
}
export function session(req: Request, db: GameDatabase) {
  const token = req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if (!token || !/^[a-f0-9]{64}$/.test(token) || !db.hasSession(tokenHash(token))) throw new UnauthorizedError();
  return tokenHash(token);
}
export async function jsonBody(req: Request, max: number) {
  if (req.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new HttpError(415, 'JSON content type required.');
  if (Number(req.headers.get('content-length')) > max) throw new HttpError(413, 'Request too large.');
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, 'Missing request body.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); throw new HttpError(413, 'Request too large.'); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Invalid JSON.'); }
}
const buckets = new Map<string, { start: number; count: number }>();
export function rateLimit(key: string, max: number) {
  const now = Date.now();
  // Bounded single-process limiter. Global limit remains effective if IP headers
  // are absent/spoofed; it is not distributed abuse prevention.
  for (const [k,v] of buckets) if (now-v.start >= 60000) buckets.delete(k);
  const b = buckets.get(key) || { start: now, count: 0 };
  b.count++; buckets.set(key,b);
  if (b.count > max || buckets.size > 10000) throw new HttpError(429, 'Too many requests. Retry in one minute.');
}
export function response(data: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}
