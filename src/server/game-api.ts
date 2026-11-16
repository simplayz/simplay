import 'server-only';
import { z } from 'zod';
import { ConflictError, UnauthorizedError, type GameDatabase } from './database';
import { parseSave, MAX_SAVE_BYTES } from '../persistence/validation';
import { COOKIE, HttpError, sameOrigin, session, jsonBody, rateLimit, response } from './http';
const write = z.object({ revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), state: z.unknown() }).strict();
export function safeError(error: unknown): Response {
  if (error instanceof HttpError) return response({ error: error.message }, error.status);
  if (error instanceof UnauthorizedError) return response({ error: 'Session missing or expired. Reload to create a session; export unsaved progress first.' }, 401);
  if (error instanceof ConflictError) return response({ error: 'A newer save exists. Choose a recovery option.' }, 409);
  return response({ error: 'Storage unavailable. Your in-memory game is unchanged. Retry saving.' }, 503);
}
export async function gameApi(req: Request, db: GameDatabase): Promise<Response> {
  try {
    if (req.method === 'GET') {
      sameOrigin(req, false);
      let hash: string;
      let cookie: string | undefined;
      try { hash = session(req, db); }
      catch (e) {
        if (!(e instanceof UnauthorizedError)) throw e;
        rateLimit('session-creation-global', 120);
        const token = db.createSession();
        cookie = `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${process.env.NODE_ENV==='production' ? '; Secure' : ''}`;
        const { tokenHash } = await import('./database');
        hash = tokenHash(token);
      }
      return response(db.read(hash), 200, cookie ? { 'Set-Cookie': cookie } : {});
    }
    if (req.method !== 'PUT') throw new HttpError(405, 'Method not allowed.');
    sameOrigin(req);
    const hash = session(req, db);
    rateLimit('save-global', 2400); rateLimit(`save:${hash}`, 120);
    const parsed = write.safeParse(await jsonBody(req, MAX_SAVE_BYTES + 1024));
    if (!parsed.success || !Object.prototype.hasOwnProperty.call(parsed.data, 'state')) throw new HttpError(400, 'Expected state and integer revision.');
    let state;
    try { state = parsed.data.state === null ? null : parseSave(parsed.data.state); }
    catch { throw new HttpError(400, 'Invalid schema-4 save structure, bounds, or references.'); }
    return response({ revision: db.write(hash, parsed.data.revision, state) });
  } catch (error) { return safeError(error); }
}
