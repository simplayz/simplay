import 'server-only';
import { z } from 'zod';
import { EXEC_META } from '../game/constants';
import { stateDigest } from '../game/advisor';
import { parseSave, MAX_SAVE_BYTES } from '../persistence/validation';
import type { GameDatabase } from './database';
import { safeError } from './game-api';
import { sameOrigin, session, rateLimit, jsonBody, HttpError, response } from './http';
const input = z.object({
  role: z.enum(['cto','cfo','coo']), prompt: z.string().trim().min(1).max(4000), state: z.unknown(),
  history: z.array(z.object({ role: z.enum(['cto','cfo','coo','ceo']), author: z.string().max(200), text: z.string().max(6000) })).max(8),
});
export async function advisorApi(req: Request, db: GameDatabase, upstream: typeof fetch = fetch) {
  try {
    sameOrigin(req); const hash = session(req, db);
    rateLimit('advisor-global', 120); rateLimit(`advisor:${hash}`, 12);
    const parsed = input.safeParse(await jsonBody(req, MAX_SAVE_BYTES + 64000));
    if (!parsed.success) throw new HttpError(400, 'Invalid advisor request.');
    const { role, history, prompt } = parsed.data;
    let state;
    try { state = parseSave(parsed.data.state); } catch { throw new HttpError(400, 'Invalid city state.'); }
    const key = process.env.AI_API_KEY;
    const model = process.env.AI_MODEL;
    const base = process.env.AI_BASE_URL;
    if (!key || !model || !base) throw new HttpError(503, 'Live advisor is not configured. Use local advice.');
    const url = new URL(base);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new HttpError(503, 'Advisor configuration unavailable.');
    const meta = EXEC_META[role];
    // Executive prompt v1 unchanged; transport/model/credentials moved server-side.
    const body = {
      model, temperature: state.execs.find(e=>e.role===role)!.ai.temperature,
      messages: [
        { role: 'system', content: `${meta.system}\n\nYou are ${meta.name}, ${meta.title} of ${state.company}. Address the CEO directly. Be specific and quantitative.\n\n${stateDigest(state)}` },
        ...history.map(m=>({ role: m.role==='ceo' ? 'user' : 'assistant', content: m.author ? `[${m.author}] ${m.text}` : m.text })),
        { role: 'user', content: prompt },
      ],
      max_tokens: 400,
    };
    const timeout = Math.max(100, Math.min(12000, Number(process.env.AI_TIMEOUT_MS) || 10000));
    try {
      const res = await upstream(`${base.replace(/\/$/,'')}/chat/completions`, {
        method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body), signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) throw new Error();
      // Bound returned text; never pass provider errors/configuration to the browser.
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim() || text.length > 12000) throw new Error();
      return response({ text: text.trim() });
    } catch { throw new HttpError(503, 'Live advisor failed or timed out. Use local advice.'); }
  } catch (e) { return safeError(e); }
}
