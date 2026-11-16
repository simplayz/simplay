import { z } from 'zod';
import { ARCHETYPE_BY_ID } from '../game/constants';
import type { GameState } from '../game/types';

// Transport limits, not balance caps: reject non-finite/absurd input while allowing debt,
// historical spending overshoot, and executive load >100 produced by the current engine.
const num = z.number().finite().min(-1e15).max(1e15);
const pos = num.nonnegative();
const count = pos.int();
const pct = num.min(0).max(100);
const text = z.string().max(12000);
const id = z.string().min(1).max(256);
const role = z.enum(['cto', 'cfo', 'coo']);
const kind = z.enum(['energy', 'food', 'factory', 'warehouse']);
const ll = z.object({ lat: num.min(-90).max(90), lng: num.min(-540).max(540) });
const point = z.tuple([num.min(-90).max(90), num.min(-540).max(540)]);
const ai = z.object({
  // Legacy credentials/URLs are unknown fields and stripped on both client and server.
  model: z.string().max(200), temperature: num.min(0).max(2), enabled: z.boolean(),
});
const plan = z.object({
  id, name: text, w: count.min(1).max(256), h: count.min(1).max(256),
  storeys: count.min(1).max(100), revision: count.min(1),
  cells: z.array(z.object({
    t: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    z: z.enum(['lobby','corridor','office','server','lab','storage','production','green','power','crew']).optional(),
    p: z.enum(['desk','rack','machine','tank','console','crate','planter','bunk']).optional(),
  })).max(65536),
}).refine(p => p.cells.length === p.w * p.h, 'Plan dimensions do not match cells');
const arch = id.refine(v => !!ARCHETYPE_BY_ID[v], 'Unknown archetype');
const site = z.object({ id, areaId: id, index: count.max(4), status: z.enum(['empty','surveyed','active','offline']), buildingId: id.nullable() });
const building = z.object({
  id, areaId: id, siteId: id, archetypeId: arch, plan, level: count.min(1), operational: z.boolean(), condition: pct,
  securityBot: z.object({ id, name: text, trust: pct, alerts: count }),
  receptionBot: z.object({ id, name: text, queue: count, satisfaction: pct }), visitorsToday: count,
});
const project = z.object({
  id, buildingId: id.nullable(), areaId: id, siteId: id, archetypeId: arch,
  phase: z.enum(['discover','design','approve','build','test','deploy','operate']),
  progress: num.min(0).max(1), owner: role, budget: pos, spent: pos,
  quality: pct, risk: pct, changeRequests: count, blockedReason: text.nullable(),
  startedTick: count, testAttempts: count, draft: plan.nullable().optional(),
});
const prices = z.object({ materials: pos, food: pos, power: pos });
const schema = z.object({
  schema: z.literal(4), ceoName: text, company: text, createdAt: count,
  claim: z.object({ center: ll, sideKm: pos.positive().max(1000), corners: z.array(point).length(4), placedBy: z.enum(['geolocation','manual']) }),
  areas: z.array(z.object({ id, kind, index: count.max(3), level: count.min(1), sites: z.array(site).length(5) })).length(4),
  buildings: z.array(building).max(20), projects: z.array(project).max(100),
  execs: z.array(z.object({ role, name: text, callsign: text, skill: pct, load: pos.max(1000), trust: pct, ai, stance: z.enum(['aggressive','balanced','cautious']) })).length(3),
  alliance: z.array(z.object({ id, name: text, kind: z.enum(['supplier','offtaker']), lat: ll.shape.lat, lng: ll.shape.lng, relation: pct,
    inventory: z.object({ credits: pos, materials: pos, food: pos, power: pos }), buyPrice: z.record(z.string().max(100), pos), sellPrice: z.record(z.string().max(100), pos),
    dealsDone: count, lastTradeTick: num.int(), mood: text })).max(100),
  roads: z.array(z.object({ id, from: id, to: id, path: z.array(point).min(2).max(1000), grade: z.union([z.literal(1),z.literal(2),z.literal(3)]), throughput: pos })).max(200),
  remote: z.array(z.object({ id, name: text, handle: text, lat: ll.shape.lat, lng: ll.shape.lng, online: z.boolean(), alliance: z.boolean(), reputation: num,
    buildings: z.array(z.object({ id, archetypeId: arch, name: text, plan, crew: count })).max(20), lastSeenTick: count, color: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).max(100),
  economy: z.object({ credits: num, materials: pos, food: pos, powerProduced: num, powerDemanded: num, storageUsed: pos, storageCap: pos,
    morale: pct, reputation: pct, level: count.min(1).max(6), xp: pos, tick: count, brownouts: count, overflowWaste: pos }),
  market: prices, log: z.array(z.object({ tick: count, kind: z.enum(['build','econ','diplo','exec','alert','visit']), text, who: text.optional() })).max(200),
  speed: z.union([z.literal(0),z.literal(1),z.literal(4),z.literal(16)]), netMode: z.literal('local-sim'),
  questions: z.array(z.object({ id, section: text, question: text, assumption: text, impact: z.enum(['high','medium','low']), answer: text })).max(100), changelogSeen: text,
}).superRefine((s, ctx) => {
  const fail = () => ctx.addIssue({ code: 'custom', message: 'Invalid or duplicate game references' });
  const unique = (xs: string[]) => new Set(xs).size === xs.length;
  if (!unique(s.areas.map(a=>a.id)) || !unique(s.areas.map(a=>String(a.index))) || !unique(s.areas.map(a=>a.kind)) ||
      !unique(s.execs.map(e=>e.role)) || !unique(s.buildings.map(b=>b.id)) || !unique(s.projects.map(p=>p.id)) ||
      !unique(s.alliance.map(b=>b.id)) || !unique(s.remote.map(r=>r.id)) || !unique(s.roads.map(r=>r.id))) fail();
  const sites = s.areas.flatMap(a=>a.sites);
  if (!unique(sites.map(si=>si.id))) fail();
  for (const a of s.areas) {
    if (!unique(a.sites.map(si=>String(si.index))) || a.sites.some(si=>si.areaId!==a.id)) fail();
  }
  for (const b of [...s.buildings, ...s.projects]) {
    const area = s.areas.find(a=>a.id===b.areaId);
    const si = area?.sites.find(si=>si.id===b.siteId);
    if (!si || ARCHETYPE_BY_ID[b.archetypeId].area!==area?.kind) fail();
  }
  if (!unique(s.buildings.map(b=>b.siteId)) || !unique(s.projects.map(p=>p.siteId))) fail();
  for (const si of sites) {
    if (si.buildingId && !s.buildings.some(b=>b.id===si.buildingId && b.siteId===si.id)) fail();
  }
  for (const b of s.buildings) if (!sites.some(si=>si.id===b.siteId && si.buildingId===b.id)) fail();
  for (const p of s.projects) if (p.buildingId && !s.buildings.some(b=>b.id===p.buildingId && b.siteId===p.siteId)) fail();
  for (const r of s.roads) if (r.from!=='claim' || ![...s.alliance,...s.remote].some(x=>x.id===r.to)) fail();
});
export const MAX_SAVE_BYTES = 4 * 1024 * 1024;
export function parseSave(input: unknown): GameState {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error('Invalid schema-4 save structure, bounds, or references.');
  return result.data as GameState;
}
export function parseSaveText(raw: string): GameState {
  if (new TextEncoder().encode(raw).length > MAX_SAVE_BYTES) throw new Error('Save exceeds 4 MiB.');
  let input: unknown;
  try { input = JSON.parse(raw); } catch { throw new Error('Invalid JSON save.'); }
  return parseSave(input);
}
