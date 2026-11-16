import { escapeHtml } from '../src/utils/escapeHtml';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { openDatabase, tokenHash, ConflictError } from '../src/server/database';
import { gameApi } from '../src/server/game-api';
import { advisorApi } from '../src/server/advisor-api';
import { createGame, demoGame, reducer } from '../src/game/engine';
import { parseSave, parseSaveText } from '../src/persistence/validation';
import { legacySave, redactLegacy } from '../src/persistence/client';
import { SaveQueue, SaveFailure } from '../src/persistence/queue';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dbs: ReturnType<typeof openDatabase>[] = [];
function db() { const d = openDatabase(':memory:'); dbs.push(d); return d; }
const fixture = () => createGame('Test CEO','Test Company',-6.3,106.7,'manual');
function request(method='GET', token?: string, data?: unknown, origin='http://localhost:3000') {
  return new Request('http://localhost:3000/api/game', { method, headers: {
    host:'localhost:3000', origin, 'Content-Type':'application/json', ...(token ? { cookie:`simplayz_session=${token}` } : {}),
  }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
}
afterEach(() => { for (const d of dbs.splice(0)) if (d.sqlite.open) d.sqlite.close(); vi.useRealTimers(); vi.unstubAllEnvs(); });
describe('snapshot boundary', () => {
  it('escapes imported names before Leaflet HTML insertion', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });
  it('accepts new/demo/long-running state and debt without rebalance', () => {
    expect(parseSave(fixture()).schema).toBe(4);
    let s=demoGame();
    for(let i=0;i<1000;i++) s=reducer(s,{type:'tick'});
    s.economy.credits=-1234;
    expect(parseSave(s).economy.credits).toBe(-1234);
  });
  it('strips legacy credentials/preferences URL and unknown nested fields in imports/exports', () => {
    const s=fixture(); const legacy=JSON.parse(JSON.stringify(s));
    legacy.execs[0].ai.apiKey='SECRET'; legacy.execs[0].ai.baseUrl='https://untrusted.invalid'; legacy.password='SECRET';
    const clean=legacySave(JSON.stringify(legacy));
    expect(JSON.stringify(clean)).not.toContain('SECRET');
    expect(clean.execs[0].ai.model).toBe(s.execs[0].ai.model);
    expect(redactLegacy(JSON.stringify(legacy))).not.toContain('SECRET');
    expect(JSON.stringify(parseSave(clean))).not.toContain('apiKey');
  });
  it('rejects malformed structure/references, nonfinite values and oversized import', () => {
    expect(()=>parseSave({schema:4})).toThrow();
    const s=fixture(); s.areas[0].sites[0].buildingId='missing'; expect(()=>parseSave(s)).toThrow();
    s.economy.credits=Infinity; expect(()=>parseSave(s)).toThrow();
    expect(()=>parseSaveText(' '.repeat(4*1024*1024+1))).toThrow();
  });
});
describe('SQLite/session API', () => {
  it('creates anonymous session, saves, reads, increments revision and redacts response', async () => {
    const d=db(); const res=await gameApi(request(),d);
    expect(res.status).toBe(200); expect(res.headers.get('set-cookie')).toContain('HttpOnly');
    const token=res.headers.get('set-cookie')!.split(';')[0].split('=')[1];
    const state=JSON.parse(JSON.stringify(fixture())); state.execs[0].ai.apiKey='SECRET';
    const saved=await gameApi(request('PUT',token,{revision:0,state}),d);
    expect(await saved.json()).toEqual({revision:1});
    const read=await gameApi(request('GET',token),d); const body=await read.json();
    expect(body.state.company).toBe('Test Company'); expect(body.revision).toBe(1);
    expect(JSON.stringify(body)).not.toContain('SECRET');
  });
  it('isolates sessions and disallows save-id/owner injection', async () => {
    const d=db(); const a=d.createSession(),b=d.createSession(); d.write(tokenHash(a),0,fixture());
    expect((await (await gameApi(request('GET',b),d)).json()).state).toBeNull();
    expect((await gameApi(request('PUT',undefined,{revision:0,state:fixture()}),d)).status).toBe(401);
    expect((await gameApi(request('PUT',b,{revision:0,state:fixture(),session_id:tokenHash(a)}),d)).status).toBe(400);
    expect(d.read(tokenHash(a)).revision).toBe(1);
  });
  it('rejects stale concurrent writes; exactly one succeeds; reset retains revision', async () => {
    const d=db(),token=d.createSession();
    const results=await Promise.all([gameApi(request('PUT',token,{revision:0,state:fixture()}),d),gameApi(request('PUT',token,{revision:0,state:fixture()}),d)]);
    expect(results.map(r=>r.status).sort()).toEqual([200,409]);
    expect(()=>d.write(tokenHash(token),0,fixture())).toThrow(ConflictError);
    expect(d.write(tokenHash(token),1,null)).toBe(2);
    expect(d.read(tokenHash(token)).state).toBeNull();
  });
  it('rejects invalid, cross-origin, missing-origin, wrong-content-type and oversized writes without replacing state', async () => {
    const d=db(),token=d.createSession();d.write(tokenHash(token),0,fixture());
    expect((await gameApi(request('PUT',token,{revision:1,state:{schema:4}}),d)).status).toBe(400);
    expect((await gameApi(request('PUT',token,{revision:1,state:null},'https://evil.invalid'),d)).status).toBe(403);
    const noOrigin=request('PUT',token,{revision:1,state:null});noOrigin.headers.delete('origin');
    expect((await gameApi(noOrigin,d)).status).toBe(403);
    const wrong=request('PUT',token,{revision:1,state:null});wrong.headers.set('content-type','text/plain');expect((await gameApi(wrong,d)).status).toBe(415);
    const large=request('PUT',token,{revision:1,state:null});large.headers.set('content-length','99999999');expect((await gameApi(large,d)).status).toBe(413);
    expect(d.read(tokenHash(token)).revision).toBe(1);
  });
  it('returns sanitized storage failure without losing durable data', async () => {
    const d=db(),token=d.createSession();d.write(tokenHash(token),0,fixture());
    d.sqlite.pragma('query_only = ON');
    const res=await gameApi(request('PUT',token,{revision:1,state:null}),d);
    expect(res.status).toBe(503);expect(await res.text()).not.toContain('SQLITE');
    expect(d.read(tokenHash(token)).state?.company).toBe('Test Company');
  });
  it('survives database close/reopen and migration rerun', () => {
    const dir=mkdtempSync(join(tmpdir(),'simplay-'));const path=join(dir,'test.sqlite');
    try { const a=openDatabase(path),token=a.createSession();a.write(tokenHash(token),0,fixture());a.sqlite.close();
      const b=openDatabase(path);expect(b.read(tokenHash(token)).revision).toBe(1);b.sqlite.close();
    } finally {rmSync(dir,{recursive:true,force:true});}
  });
});
describe('advisor transport (mocked, not live model evaluation)', () => {
  async function setup() {const d=db(),token=d.createSession();return {d, req:()=>request('POST',token,{role:'cto',prompt:'Power?',history:[],state:fixture()})};}
  it('uses only configured credentials/model and rejects missing config', async () => {
    const {d,req}=await setup(); vi.stubEnv('AI_API_KEY','');
    expect((await advisorApi(req(),d)).status).toBe(503);
    vi.stubEnv('AI_API_KEY','SERVER_SECRET');vi.stubEnv('AI_MODEL','operator-model');vi.stubEnv('AI_BASE_URL','https://provider.invalid/v1');
    const mock=vi.fn<typeof fetch>(async (_url,options)=>{
      expect(JSON.parse(options!.body as string).model).toBe('operator-model');
      expect((options!.headers as Record<string,string>).Authorization).toBe('Bearer SERVER_SECRET');
      return Response.json({choices:[{message:{content:'Grounded advice'}}]});
    });
    const res=await advisorApi(req(),d,mock);expect(await res.json()).toEqual({text:'Grounded advice'});
  });
  it('bounds timeout and hides upstream failures/empty completions', async () => {
    const {d,req}=await setup();vi.stubEnv('AI_API_KEY','SECRET');vi.stubEnv('AI_MODEL','model');vi.stubEnv('AI_BASE_URL','https://provider.invalid');vi.stubEnv('AI_TIMEOUT_MS','100');
    const stalled:typeof fetch=(_url,opts)=>new Promise((_resolve,reject)=>opts!.signal!.addEventListener('abort',()=>reject(new Error('PRIVATE'))));
    const res=await advisorApi(req(),d,stalled);expect(res.status).toBe(503);expect(await res.text()).not.toContain('PRIVATE');
    expect((await advisorApi(req(),d,async()=>Response.json({choices:[]}))).status).toBe(503);
    expect((await advisorApi(req(),d,async()=>new Response('SECRET',{status:500}))).status).toBe(503);
  });
});
describe('serialized autosave', () => {
  it.each([1000,250,62.5])('continuous %d ms ticks never reset deadline; coalesces while in flight', async interval => {
    vi.useFakeTimers(); const write=vi.fn(async()=>1);const q=new SaveQueue(0,write,()=>{});const s=fixture();
    const timer=setInterval(()=>q.enqueue(s),interval);
    await vi.advanceTimersByTimeAsync(5000);expect(write).toHaveBeenCalled();clearInterval(timer);q.dispose();
  });
  it('one write in flight, pending snapshot retained after failure, explicit retry', async () => {
    let finish!:(n:number)=>void;const write=vi.fn(()=>new Promise<number>(r=>{finish=r;}));const q=new SaveQueue(0,write,()=>{});
    q.enqueue(fixture(),true);q.enqueue(fixture(),true);await q.flush();expect(write).toHaveBeenCalledTimes(1);finish(1);await Promise.resolve();q.dispose();
    const failure=vi.fn().mockRejectedValueOnce(new SaveFailure(503)).mockResolvedValue(1);const r=new SaveQueue(0,failure,()=>{});
    r.enqueue(fixture(),true);await new Promise(resolve=>setTimeout(resolve,0));expect(r.status).toBe('error');r.retry();await Promise.resolve();expect(failure).toHaveBeenCalledTimes(2);r.dispose();
  });
  it('conflict halts autosave/retry until explicit recovery creates a fresh queue', async()=>{
    const write=vi.fn(async()=>{throw new SaveFailure(409);});const q=new SaveQueue(0,write,()=>{});
    q.enqueue(fixture(),true);await new Promise(resolve=>setTimeout(resolve,0));q.enqueue(fixture(),true);q.retry();expect(write).toHaveBeenCalledTimes(1);expect(q.status).toBe('conflict');q.dispose();
  });
});
