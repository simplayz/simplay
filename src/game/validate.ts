import { ARCHETYPE_BY_ID, AREA_META, ZONE_META } from "./constants";
import { PHASES } from "./types";
import type { CellType, GameState, Phase, PropKind, ZoneKind } from "./types";

export const GAME_SCHEMA = 4;
export const LEGACY_SAVE_KEY = "simplayz.save.v4";
export const MAX_SAVE_JSON_BYTES = 1_500_000;

const AREA_KINDS = ["energy", "food", "factory", "warehouse"] as const;
const EXEC_ROLES = ["cto", "cfo", "coo"] as const;
const COMMODITIES = ["materials", "food", "power", "credits"] as const;
const STANCES = ["aggressive", "balanced", "cautious"] as const;
const LOG_KINDS = ["build", "econ", "diplo", "exec", "alert", "visit"] as const;
const IMPACTS = ["high", "medium", "low"] as const;
const CELL_TYPES: CellType[] = [0, 1, 2, 3, 4];
const ZONE_KINDS = Object.keys(ZONE_META) as ZoneKind[];
const PROP_KINDS = ["desk", "rack", "machine", "tank", "console", "crate", "planter", "bunk"] as const satisfies readonly PropKind[];
const SENSITIVE_KEYS = new Set([
  "apikey",
  "api_key",
  "apibaseurl",
  "baseurl",
  "authorization",
  "password",
  "secret",
  "accesstoken",
  "refreshtoken",
]);

export type ValidationResult = { ok: true; state: GameState } | { ok: false; error: string };

class InvalidSave extends Error {}

function fail(path: string, message: string): never {
  throw new InvalidSave(`${path}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(path, "expected an object");
  return value;
}

function array(value: unknown, path: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value)) fail(path, "expected an array");
  if (value.length < min || value.length > max) fail(path, `expected ${min}–${max} entries`);
  return value;
}

function str(value: unknown, path: string, min: number, max: number): string {
  if (typeof value !== "string") fail(path, "expected a string");
  if (value.length < min || value.length > max) fail(path, `expected ${min}–${max} characters`);
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "expected a boolean");
  return value;
}

function num(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "expected a finite number");
  if (value < min || value > max) fail(path, `expected ${min}–${max}`);
  return value;
}

function int(value: unknown, path: string, min: number, max: number): number {
  const n = num(value, path, min, max);
  if (!Number.isInteger(n)) fail(path, "expected an integer");
  return n;
}

function oneOf<T extends string | number>(value: unknown, path: string, values: readonly T[]): T {
  if (!values.includes(value as T)) fail(path, `expected one of ${values.join(", ")}`);
  return value as T;
}

/**
 * Removes credential/endpoint fields and normalises the advisor preference to
 * the new server-managed shape. It deliberately does not make an invalid save
 * valid: structural validation still runs afterwards.
 */
export function sanitizeGameState(input: unknown): unknown {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (!isRecord(value)) return value;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) continue;
      out[key] = walk(child);
    }
    return out;
  };

  const sanitized = walk(input);
  if (!isRecord(sanitized)) return sanitized;
  if (Array.isArray(sanitized.execs)) {
    sanitized.execs = sanitized.execs.map((exec) => {
      if (!isRecord(exec)) return exec;
      const ai = isRecord(exec.ai) ? exec.ai : {};
      return {
        ...exec,
        ai: {
          enabled: typeof ai.enabled === "boolean" ? ai.enabled : false,
          temperature:
            typeof ai.temperature === "number" && Number.isFinite(ai.temperature)
              ? Math.max(0, Math.min(1.4, ai.temperature))
              : 0.6,
        },
      };
    });
  }
  return sanitized;
}

export function validateGameState(input: unknown): ValidationResult {
  try {
    const s = record(input, "save");
    if (s.schema !== GAME_SCHEMA) fail("schema", `expected ${GAME_SCHEMA}`);

    str(s.ceoName, "ceoName", 1, 80);
    str(s.company, "company", 1, 80);
    num(s.createdAt, "createdAt", 0, Number.MAX_SAFE_INTEGER);
    oneOf(s.speed, "speed", [0, 1, 4, 16] as const);
    oneOf(s.netMode, "netMode", ["local-sim", "live"] as const);
    str(s.changelogSeen, "changelogSeen", 0, 40);

    validateClaim(s.claim);
    const areaIds = validateAreas(s.areas);
    const siteIds = validateSiteIndex(s.areas, areaIds);
    const buildingIds = validateBuildings(s.buildings, areaIds, siteIds);
    validateProjects(s.projects, areaIds, siteIds, buildingIds);
    validateExecs(s.execs);
    validateAlliance(s.alliance);
    validateRoads(s.roads);
    validateRemote(s.remote);
    validateEconomy(s.economy);
    validateMarket(s.market);
    validateLog(s.log);
    validateQuestions(s.questions);

    const serialized = JSON.stringify(s);
    if (new TextEncoder().encode(serialized).length > MAX_SAVE_JSON_BYTES) {
      fail("save", `serialized save exceeds ${MAX_SAVE_JSON_BYTES} bytes`);
    }
    return { ok: true, state: s as unknown as GameState };
  } catch (error) {
    if (error instanceof InvalidSave) return { ok: false, error: error.message };
    return { ok: false, error: "save validation failed" };
  }
}

/** Validate and strip credentials in one step, suitable for import/migration. */
export function prepareGameState(input: unknown): ValidationResult {
  return validateGameState(sanitizeGameState(input));
}

function validateClaim(value: unknown): void {
  const claim = record(value, "claim");
  const center = record(claim.center, "claim.center");
  num(center.lat, "claim.center.lat", -90, 90);
  num(center.lng, "claim.center.lng", -180, 180);
  num(claim.sideKm, "claim.sideKm", 4, 16);
  const corners = array(claim.corners, "claim.corners", 4, 4);
  corners.forEach((corner, i) => {
    const pair = array(corner, `claim.corners[${i}]`, 2, 2);
    num(pair[0], `claim.corners[${i}][0]`, -90, 90);
    num(pair[1], `claim.corners[${i}][1]`, -180, 180);
  });
  oneOf(claim.placedBy, "claim.placedBy", ["geolocation", "manual"] as const);
}

function validateAreas(value: unknown): Set<string> {
  const areas = array(value, "areas", 4, 4);
  const ids = new Set<string>();
  const kinds = new Set<string>();
  areas.forEach((raw, i) => {
    const area = record(raw, `areas[${i}]`);
    const id = str(area.id, `areas[${i}].id`, 1, 60);
    if (ids.has(id)) fail(`areas[${i}].id`, "duplicate area id");
    ids.add(id);
    const kind = oneOf(area.kind, `areas[${i}].kind`, AREA_KINDS);
    if (kinds.has(kind)) fail(`areas[${i}].kind`, "duplicate area kind");
    kinds.add(kind);
    int(area.index, `areas[${i}].index`, 0, 3);
    int(area.level, `areas[${i}].level`, 1, 99);
    const sites = array(area.sites, `areas[${i}].sites`, 5, 5);
    sites.forEach((rawSite, j) => {
      const site = record(rawSite, `areas[${i}].sites[${j}]`);
      str(site.id, `areas[${i}].sites[${j}].id`, 1, 60);
      if (site.areaId !== id) fail(`areas[${i}].sites[${j}].areaId`, "does not match parent area");
      int(site.index, `areas[${i}].sites[${j}].index`, 0, 4);
      oneOf(site.status, `areas[${i}].sites[${j}].status`, ["empty", "surveyed", "active", "offline"] as const);
      if (site.buildingId !== null && typeof site.buildingId !== "string") {
        fail(`areas[${i}].sites[${j}].buildingId`, "expected a string or null");
      }
    });
  });
  if (!AREA_KINDS.every((k) => kinds.has(k))) fail("areas", "must contain all four area kinds");
  return ids;
}

function validateSiteIndex(value: unknown, areaIds: Set<string>): Map<string, { areaId: string; index: number }> {
  const areas = value as unknown[];
  const sites = new Map<string, { areaId: string; index: number }>();
  areas.forEach((raw, i) => {
    const area = record(raw, `areas[${i}]`);
    const areaId = area.id as string;
    if (!areaIds.has(areaId)) fail(`areas[${i}].id`, "unknown area");
    const siteList = area.sites as unknown[];
    siteList.forEach((rawSite, j) => {
      const site = record(rawSite, `areas[${i}].sites[${j}]`);
      const siteId = site.id as string;
      if (sites.has(siteId)) fail(`areas[${i}].sites[${j}].id`, "duplicate site id");
      sites.set(siteId, { areaId, index: site.index as number });
    });
  });
  return sites;
}

function validatePlan(value: unknown, path: string): void {
  const plan = record(value, path);
  str(plan.id, `${path}.id`, 1, 80);
  str(plan.name, `${path}.name`, 0, 120);
  const w = int(plan.w, `${path}.w`, 1, 64);
  const h = int(plan.h, `${path}.h`, 1, 64);
  int(plan.storeys, `${path}.storeys`, 1, 8);
  int(plan.revision, `${path}.revision`, 0, 1_000_000);
  const cells = array(plan.cells, `${path}.cells`, w * h, w * h);
  cells.forEach((raw, i) => {
    const cell = record(raw, `${path}.cells[${i}]`);
    oneOf(cell.t, `${path}.cells[${i}].t`, CELL_TYPES);
    if (cell.z !== undefined) oneOf(cell.z, `${path}.cells[${i}].z`, ZONE_KINDS);
    if (cell.p !== undefined) oneOf(cell.p, `${path}.cells[${i}].p`, PROP_KINDS);
  });
}

function validateBuildings(value: unknown, areaIds: Set<string>, sites: Map<string, { areaId: string; index: number }>): Set<string> {
  const buildings = array(value, "buildings", 0, 20);
  const ids = new Set<string>();
  buildings.forEach((raw, i) => {
    const b = record(raw, `buildings[${i}]`);
    const id = str(b.id, `buildings[${i}].id`, 1, 80);
    if (ids.has(id)) fail(`buildings[${i}].id`, "duplicate building id");
    ids.add(id);
    const areaId = str(b.areaId, `buildings[${i}].areaId`, 1, 60);
    const siteId = str(b.siteId, `buildings[${i}].siteId`, 1, 60);
    if (!areaIds.has(areaId)) fail(`buildings[${i}].areaId`, "unknown area");
    const site = sites.get(siteId);
    if (!site) fail(`buildings[${i}].siteId`, "unknown site");
    if (site.areaId !== areaId) fail(`buildings[${i}].areaId`, "does not match site area");
    if (!ARCHETYPE_BY_ID[str(b.archetypeId, `buildings[${i}].archetypeId`, 1, 60)]) {
      fail(`buildings[${i}].archetypeId`, "unknown archetype");
    }
    validatePlan(b.plan, `buildings[${i}].plan`);
    int(b.level, `buildings[${i}].level`, 1, 99);
    bool(b.operational, `buildings[${i}].operational`);
    num(b.condition, `buildings[${i}].condition`, 0, 100);
    const security = record(b.securityBot, `buildings[${i}].securityBot`);
    str(security.id, `buildings[${i}].securityBot.id`, 1, 80);
    str(security.name, `buildings[${i}].securityBot.name`, 1, 80);
    num(security.trust, `buildings[${i}].securityBot.trust`, 0, 100);
    int(security.alerts, `buildings[${i}].securityBot.alerts`, 0, 1_000_000);
    const reception = record(b.receptionBot, `buildings[${i}].receptionBot`);
    str(reception.id, `buildings[${i}].receptionBot.id`, 1, 80);
    str(reception.name, `buildings[${i}].receptionBot.name`, 1, 80);
    int(reception.queue, `buildings[${i}].receptionBot.queue`, 0, 1_000_000);
    num(reception.satisfaction, `buildings[${i}].receptionBot.satisfaction`, 0, 100);
    int(b.visitorsToday, `buildings[${i}].visitorsToday`, 0, 1_000_000);
  });
  return ids;
}

function validateProjects(value: unknown, areaIds: Set<string>, sites: Map<string, { areaId: string; index: number }>, buildingIds: Set<string>): void {
  const projects = array(value, "projects", 0, 20);
  const ids = new Set<string>();
  projects.forEach((raw, i) => {
    const p = record(raw, `projects[${i}]`);
    const id = str(p.id, `projects[${i}].id`, 1, 80);
    if (ids.has(id)) fail(`projects[${i}].id`, "duplicate project id");
    ids.add(id);
    if (p.buildingId !== null) {
      const buildingId = str(p.buildingId, `projects[${i}].buildingId`, 1, 80);
      if (!buildingIds.has(buildingId)) fail(`projects[${i}].buildingId`, "unknown building");
    }
    const areaId = str(p.areaId, `projects[${i}].areaId`, 1, 60);
    if (!areaIds.has(areaId)) fail(`projects[${i}].areaId`, "unknown area");
    const siteId = str(p.siteId, `projects[${i}].siteId`, 1, 60);
    const site = sites.get(siteId);
    if (!site) fail(`projects[${i}].siteId`, "unknown site");
    if (site.areaId !== areaId) fail(`projects[${i}].areaId`, "does not match site area");
    if (!ARCHETYPE_BY_ID[str(p.archetypeId, `projects[${i}].archetypeId`, 1, 60)]) {
      fail(`projects[${i}].archetypeId`, "unknown archetype");
    }
    oneOf(p.phase, `projects[${i}].phase`, PHASES as readonly Phase[]);
    num(p.progress, `projects[${i}].progress`, 0, 2);
    oneOf(p.owner, `projects[${i}].owner`, EXEC_ROLES);
    num(p.budget, `projects[${i}].budget`, 0, 1e15);
    num(p.spent, `projects[${i}].spent`, 0, 1e15);
    num(p.quality, `projects[${i}].quality`, 0, 100);
    num(p.risk, `projects[${i}].risk`, 0, 100);
    int(p.changeRequests, `projects[${i}].changeRequests`, 0, 1_000_000);
    if (p.blockedReason !== null) str(p.blockedReason, `projects[${i}].blockedReason`, 0, 600);
    int(p.startedTick, `projects[${i}].startedTick`, 0, 1e12);
    int(p.testAttempts, `projects[${i}].testAttempts`, 0, 3);
    if (p.draft !== undefined && p.draft !== null) validatePlan(p.draft, `projects[${i}].draft`);
  });
}

function validateExecs(value: unknown): void {
  const execs = array(value, "execs", 3, 3);
  const seen = new Set<string>();
  execs.forEach((raw, i) => {
    const e = record(raw, `execs[${i}]`);
    const role = oneOf(e.role, `execs[${i}].role`, EXEC_ROLES);
    if (seen.has(role)) fail(`execs[${i}].role`, "duplicate role");
    seen.add(role);
    str(e.name, `execs[${i}].name`, 1, 80);
    str(e.callsign, `execs[${i}].callsign`, 1, 80);
    num(e.skill, `execs[${i}].skill`, 0, 100);
    num(e.load, `execs[${i}].load`, 0, 100);
    num(e.trust, `execs[${i}].trust`, 0, 100);
    oneOf(e.stance, `execs[${i}].stance`, STANCES);
    const ai = record(e.ai, `execs[${i}].ai`);
    bool(ai.enabled, `execs[${i}].ai.enabled`);
    num(ai.temperature, `execs[${i}].ai.temperature`, 0, 1.4);
  });
  if (!EXEC_ROLES.every((role) => seen.has(role))) fail("execs", "must contain cto, cfo and coo");
}

function validateAlliance(value: unknown): void {
  const bots = array(value, "alliance", 0, 10);
  const ids = new Set<string>();
  bots.forEach((raw, i) => {
    const b = record(raw, `alliance[${i}]`);
    const id = str(b.id, `alliance[${i}].id`, 1, 80);
    if (ids.has(id)) fail(`alliance[${i}].id`, "duplicate bot id");
    ids.add(id);
    str(b.name, `alliance[${i}].name`, 1, 100);
    oneOf(b.kind, `alliance[${i}].kind`, ["supplier", "offtaker"] as const);
    num(b.lat, `alliance[${i}].lat`, -90, 90);
    num(b.lng, `alliance[${i}].lng`, -180, 180);
    num(b.relation, `alliance[${i}].relation`, 0, 100);
    const inventory = record(b.inventory, `alliance[${i}].inventory`);
    for (const c of COMMODITIES) num(inventory[c], `alliance[${i}].inventory.${c}`, -1e15, 1e15);
    for (const key of ["buyPrice", "sellPrice"] as const) {
      const prices = record(b[key], `alliance[${i}].${key}`);
      for (const [name, price] of Object.entries(prices)) {
        num(price, `alliance[${i}].${key}.${name}`, 0, 1e9);
      }
    }
    int(b.dealsDone, `alliance[${i}].dealsDone`, 0, 1_000_000);
    num(b.lastTradeTick, `alliance[${i}].lastTradeTick`, -1e9, 1e12);
    str(b.mood, `alliance[${i}].mood`, 0, 40);
  });
}

function validateRoads(value: unknown): void {
  const roads = array(value, "roads", 0, 20);
  const ids = new Set<string>();
  roads.forEach((raw, i) => {
    const r = record(raw, `roads[${i}]`);
    const id = str(r.id, `roads[${i}].id`, 1, 80);
    if (ids.has(id)) fail(`roads[${i}].id`, "duplicate road id");
    ids.add(id);
    str(r.from, `roads[${i}].from`, 1, 80);
    str(r.to, `roads[${i}].to`, 1, 80);
    const path = array(r.path, `roads[${i}].path`, 2, 16);
    path.forEach((rawPoint, j) => {
      const point = array(rawPoint, `roads[${i}].path[${j}]`, 2, 2);
      num(point[0], `roads[${i}].path[${j}][0]`, -90, 90);
      num(point[1], `roads[${i}].path[${j}][1]`, -180, 180);
    });
    oneOf(r.grade, `roads[${i}].grade`, [1, 2, 3] as const);
    num(r.throughput, `roads[${i}].throughput`, 0, 1e9);
  });
}

function validateRemote(value: unknown): void {
  const peers = array(value, "remote", 0, 20);
  const ids = new Set<string>();
  peers.forEach((raw, i) => {
    const p = record(raw, `remote[${i}]`);
    const id = str(p.id, `remote[${i}].id`, 1, 80);
    if (ids.has(id)) fail(`remote[${i}].id`, "duplicate peer id");
    ids.add(id);
    str(p.name, `remote[${i}].name`, 1, 100);
    str(p.handle, `remote[${i}].handle`, 1, 80);
    num(p.lat, `remote[${i}].lat`, -90, 90);
    num(p.lng, `remote[${i}].lng`, -180, 180);
    bool(p.online, `remote[${i}].online`);
    bool(p.alliance, `remote[${i}].alliance`);
    num(p.reputation, `remote[${i}].reputation`, 0, 100);
    const buildings = array(p.buildings, `remote[${i}].buildings`, 0, 10);
    buildings.forEach((rawBuilding, j) => {
      const b = record(rawBuilding, `remote[${i}].buildings[${j}]`);
      str(b.id, `remote[${i}].buildings[${j}].id`, 1, 80);
      if (!ARCHETYPE_BY_ID[str(b.archetypeId, `remote[${i}].buildings[${j}].archetypeId`, 1, 60)]) {
        fail(`remote[${i}].buildings[${j}].archetypeId`, "unknown archetype");
      }
      str(b.name, `remote[${i}].buildings[${j}].name`, 1, 120);
      validatePlan(b.plan, `remote[${i}].buildings[${j}].plan`);
      int(b.crew, `remote[${i}].buildings[${j}].crew`, 0, 10_000);
    });
    int(p.lastSeenTick, `remote[${i}].lastSeenTick`, 0, 1e12);
    str(p.color, `remote[${i}].color`, 1, 40);
  });
}

function validateEconomy(value: unknown): void {
  const e = record(value, "economy");
  // Debt is a legitimate gameplay state: allow a negative treasury rather than
  // silently rebalancing or rejecting the save.
  num(e.credits, "economy.credits", -1e15, 1e15);
  num(e.materials, "economy.materials", 0, 1e15);
  num(e.food, "economy.food", 0, 1e15);
  num(e.powerProduced, "economy.powerProduced", 0, 1e12);
  num(e.powerDemanded, "economy.powerDemanded", 0, 1e12);
  num(e.storageUsed, "economy.storageUsed", 0, 1e15);
  num(e.storageCap, "economy.storageCap", 0, 1e15);
  num(e.morale, "economy.morale", 0, 100);
  num(e.reputation, "economy.reputation", 0, 100);
  int(e.level, "economy.level", 1, 6);
  num(e.xp, "economy.xp", 0, 1e15);
  int(e.tick, "economy.tick", 0, 1e12);
  int(e.brownouts, "economy.brownouts", 0, 1e12);
  num(e.overflowWaste, "economy.overflowWaste", 0, 1e15);
}

function validateMarket(value: unknown): void {
  const market = record(value, "market");
  num(market.materials, "market.materials", 0.01, 1e9);
  num(market.food, "market.food", 0.01, 1e9);
  num(market.power, "market.power", 0.01, 1e9);
}

function validateLog(value: unknown): void {
  const log = array(value, "log", 0, 140);
  log.forEach((raw, i) => {
    const entry = record(raw, `log[${i}]`);
    int(entry.tick, `log[${i}].tick`, 0, 1e12);
    oneOf(entry.kind, `log[${i}].kind`, LOG_KINDS);
    str(entry.text, `log[${i}].text`, 0, 2_000);
    if (entry.who !== undefined) str(entry.who, `log[${i}].who`, 0, 80);
  });
}

function validateQuestions(value: unknown): void {
  const questions = array(value, "questions", 0, 50);
  const ids = new Set<string>();
  questions.forEach((raw, i) => {
    const q = record(raw, `questions[${i}]`);
    const id = str(q.id, `questions[${i}].id`, 1, 40);
    if (ids.has(id)) fail(`questions[${i}].id`, "duplicate question id");
    ids.add(id);
    str(q.section, `questions[${i}].section`, 0, 120);
    str(q.question, `questions[${i}].question`, 0, 1_000);
    str(q.assumption, `questions[${i}].assumption`, 0, 2_000);
    oneOf(q.impact, `questions[${i}].impact`, IMPACTS);
    str(q.answer, `questions[${i}].answer`, 0, 4_000);
  });
}

export function isLegacySave(value: unknown): boolean {
  return isRecord(value) && value.schema === GAME_SCHEMA && isRecord(value.claim);
}

export function areaKindValid(kind: string): boolean {
  return Object.prototype.hasOwnProperty.call(AREA_META, kind);
}
