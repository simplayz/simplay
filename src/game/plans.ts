import type { AreaKind, Archetype, Cell, FloorPlan, PropKind, ZoneKind } from "./types";
import { hashString, mulberry32 } from "./geo";

/**
 * GDD §5.4 — Procedural floor-plan authoring.
 * Plans are a w×h grid of 1 m cells. Every archetype ships with a default
 * program (room schedule) that the CEO can then edit in the Studio. The 3D
 * interior is generated from these exact cells, so plan ↔ 3D is a hard promise.
 */

export const VOID = 0 as const;
export const FLOOR = 1 as const;
export const WALL = 2 as const;
export const DOOR = 3 as const;
export const GLASS = 4 as const;

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  zone: ZoneKind;
  label: string;
  doorOn?: "n" | "s" | "e" | "w";
  doorAt?: number;
  glaze?: boolean;
}

export function makePlan(
  id: string,
  name: string,
  w: number,
  h: number,
  rooms: Room[],
  storeys = 1,
  seed = 1,
): FloorPlan {
  const cells: Cell[] = new Array(w * h);
  for (let i = 0; i < cells.length; i++) cells[i] = { t: VOID };
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? cells[y * w + x] : null);
  const set = (x: number, y: number, c: Partial<Cell>) => {
    const cell = at(x, y);
    if (cell) Object.assign(cell, c);
  };

  // 1. interiors
  for (const r of rooms) {
    for (let y = r.y + 1; y < r.y + r.h - 1; y++)
      for (let x = r.x + 1; x < r.x + r.w - 1; x++) set(x, y, { t: FLOOR, z: r.zone });
  }
  // 2. perimeters become walls (shared edges collapse into a 1 m wall)
  for (const r of rooms) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (at(x, r.y)?.t !== FLOOR) set(x, r.y, { t: WALL, z: undefined, p: undefined });
      if (at(x, r.y + r.h - 1)?.t !== FLOOR)
        set(x, r.y + r.h - 1, { t: WALL, z: undefined, p: undefined });
    }
    for (let y = r.y; y < r.y + r.h; y++) {
      if (at(r.x, y)?.t !== FLOOR) set(r.x, y, { t: WALL, z: undefined, p: undefined });
      if (at(r.x + r.w - 1, y)?.t !== FLOOR)
        set(r.x + r.w - 1, y, { t: WALL, z: undefined, p: undefined });
    }
  }
  // 3. doors
  for (const r of rooms) {
    if (!r.doorOn) continue;
    const mid = r.doorAt ?? 0;
    if (r.doorOn === "n") set(r.x + Math.min(r.w - 2, Math.max(1, mid)), r.y, { t: DOOR });
    if (r.doorOn === "s")
      set(r.x + Math.min(r.w - 2, Math.max(1, mid)), r.y + r.h - 1, { t: DOOR });
    if (r.doorOn === "w") set(r.x, r.y + Math.min(r.h - 2, Math.max(1, mid)), { t: DOOR });
    if (r.doorOn === "e")
      set(r.x + r.w - 1, r.y + Math.min(r.h - 2, Math.max(1, mid)), { t: DOOR });
  }
  // 4. glazing on selected exterior walls
  const rnd = mulberry32(seed * 7919 + 11);
  for (const r of rooms) {
    if (!r.glaze) continue;
    for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
      for (const y of [r.y, r.y + r.h - 1]) {
        const c = at(x, y);
        if (c?.t === WALL && (y === 0 || y === h - 1) && rnd() < 0.45) set(x, y, { t: GLASS });
      }
    }
  }
  // 5. props
  for (const r of rooms) scatterProps(cells, w, r, rnd);

  return { id, name, w, h, cells, storeys, revision: 1 };
}

const PROP_STRIDE: Record<ZoneKind, { p: PropKind; sx: number; sy: number; fill: number }> = {
  lobby: { p: "console", sx: 3, sy: 3, fill: 0.12 },
  corridor: { p: "crate", sx: 9, sy: 9, fill: 0 },
  office: { p: "desk", sx: 3, sy: 3, fill: 0.72 },
  server: { p: "rack", sx: 2, sy: 3, fill: 0.85 },
  lab: { p: "console", sx: 3, sy: 3, fill: 0.6 },
  storage: { p: "crate", sx: 3, sy: 3, fill: 0.8 },
  production: { p: "machine", sx: 4, sy: 4, fill: 0.62 },
  green: { p: "planter", sx: 2, sy: 2, fill: 0.9 },
  power: { p: "tank", sx: 3, sy: 4, fill: 0.7 },
  crew: { p: "bunk", sx: 3, sy: 3, fill: 0.7 },
};

function scatterProps(cells: Cell[], w: number, r: Room, rnd: () => number) {
  const spec = PROP_STRIDE[r.zone];
  if (spec.fill <= 0) return;
  for (let y = r.y + 1; y < r.y + r.h - 1; y++) {
    for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
      const c = cells[y * w + x];
      if (c.t !== FLOOR || c.p) continue;
      const gx = (x - r.x - 1) % spec.sx;
      const gy = (y - r.y - 1) % spec.sy;
      // keep a 1 m clear aisle and stay off door thresholds
      const edge = x === r.x + 1 || y === r.y + 1 || x === r.x + r.w - 2 || y === r.y + r.h - 2;
      const nearDoor = isNearDoor(cells, w, x, y);
      if (nearDoor || edge) continue;
      if (gx === 0 && gy === 0 && rnd() < spec.fill) c.p = spec.p;
    }
  }
}

function isNearDoor(cells: Cell[], w: number, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || ny * w + nx >= cells.length) continue;
      if (cells[ny * w + nx].t === DOOR) return true;
    }
  return false;
}

/** Default room program per sector kind. Rects tile the footprint exactly. */
export function defaultProgram(kind: AreaKind, w: number, h: number, _seed = 0): Room[] {
  const southH = Math.max(4, Math.round(h * 0.26));
  const corrY = southH;
  const corrH = 3;
  const northY = corrY + corrH;
  const northH = h - northY;
  const lobbyW = Math.max(5, Math.round(w * 0.28));
  const rooms: Room[] = [];

  rooms.push({ x: 0, y: 0, w: lobbyW, h: southH, zone: "lobby", label: "Reception", doorOn: "n", doorAt: 2, glaze: true });

  const southW = w - lobbyW;
  const southZone: Record<AreaKind, { z: ZoneKind; l: string }> = {
    energy: { z: "office", l: "Site Office" },
    food: { z: "crew", l: "Crew Mess" },
    factory: { z: "office", l: "Site Office" },
    warehouse: { z: "office", l: "Dispatch Office" },
  };
  rooms.push({ x: lobbyW, y: 0, w: southW, h: southH, zone: southZone[kind].z, label: southZone[kind].l, doorOn: "n", doorAt: 2, glaze: true });

  rooms.push({ x: 0, y: corrY, w, h: corrH, zone: "corridor", label: "Spine Corridor" });

  const north = northSplits[kind](w, northH, northY);
  rooms.push(...north);
  return rooms;
}

type SplitFn = (w: number, northH: number, northY: number) => Room[];

const northSplits: Record<AreaKind, SplitFn> = {
  energy: (w, nh, ny) => {
    const a = Math.round(w * 0.58);
    return [
      { x: 0, y: ny, w: a, h: nh, zone: "power", label: "Generator Hall", doorOn: "s", doorAt: 3 },
      { x: a, y: ny, w: w - a, h: nh, zone: "server", label: "Control Room", doorOn: "s", doorAt: 2, glaze: true },
    ];
  },
  food: (w, nh, ny) => {
    const a = Math.round(w * 0.42);
    const b = Math.round(w * 0.3);
    return [
      { x: 0, y: ny, w: a, h: nh, zone: "green", label: "Grow Bay A", doorOn: "s", doorAt: 3 },
      { x: a, y: ny, w: b, h: nh, zone: "green", label: "Grow Bay B", doorOn: "s", doorAt: 2 },
      { x: a + b, y: ny, w: w - a - b, h: nh, zone: "storage", label: "Cold Store", doorOn: "s", doorAt: 2 },
    ];
  },
  factory: (w, nh, ny) => {
    const a = Math.round(w * 0.52);
    const b = Math.round(w * 0.24);
    return [
      { x: 0, y: ny, w: a, h: nh, zone: "production", label: "Production Floor", doorOn: "s", doorAt: 4 },
      { x: a, y: ny, w: b, h: nh, zone: "lab", label: "QC Lab", doorOn: "s", doorAt: 2, glaze: true },
      { x: a + b, y: ny, w: w - a - b, h: nh, zone: "storage", label: "Bond Store", doorOn: "s", doorAt: 2 },
    ];
  },
  warehouse: (w, nh, ny) => {
    const a = Math.round(w * 0.68);
    return [
      { x: 0, y: ny, w: a, h: nh, zone: "storage", label: "High Bay Racking", doorOn: "s", doorAt: 5 },
      { x: a, y: ny, w: w - a, h: nh, zone: "production", label: "Cross-Dock", doorOn: "s", doorAt: 2 },
    ];
  },
};

export function generatePlan(arch: Archetype, nameSeed: string, level = 1): FloorPlan {
  const seed = hashString(arch.id + nameSeed);
  const w = arch.size.w + (level - 1) * 2;
  const h = arch.size.h + (level - 1) * 2;
  return makePlan(
    `plan_${seed.toString(36)}`,
    `${arch.name} — Rev A`,
    w,
    h,
    defaultProgram(arch.area, w, h, seed),
    arch.tier >= 3 ? 2 : 1,
    seed,
  );
}

export function planStats(p: FloorPlan) {
  let floor = 0;
  let wall = 0;
  let doors = 0;
  let glass = 0;
  const zones: Record<string, number> = {};
  for (const c of p.cells) {
    if (c.t === FLOOR) {
      floor++;
      if (c.z) zones[c.z] = (zones[c.z] ?? 0) + 1;
    } else if (c.t === WALL) wall++;
    else if (c.t === DOOR) doors++;
    else if (c.t === GLASS) glass++;
  }
  return { floor, wall, doors, glass, zones, usableM2: floor, rooms: Object.keys(zones).length };
}

export function clonePlan(p: FloorPlan): FloorPlan {
  return {
    ...p,
    cells: p.cells.map((c) => ({ ...c })),
    revision: p.revision + 1,
    name: p.name.replace(/Rev [A-Z]$/, "") + `Rev ${String.fromCharCode(64 + Math.min(26, p.revision + 1))}`,
  };
}

export function blankPlan(w: number, h: number, id: string, name: string): FloorPlan {
  const cells: Cell[] = new Array(w * h)
    .fill(null)
    .map(() => ({ t: FLOOR, z: "corridor" } as Cell));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) cells[y * w + x] = { t: WALL };
  return { id, name, w, h, cells, storeys: 1, revision: 1 };
}

/** Walkability test shared by the 3D client and the pathing helpers. */
export function isSolid(p: FloorPlan, x: number, z: number): boolean {
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  if (cx < 0 || cz < 0 || cx >= p.w || cz >= p.h) return true;
  const t = p.cells[cz * p.w + cx].t;
  return t === WALL || t === VOID || t === GLASS;
}

export function findSpawn(p: FloorPlan): { x: number; z: number } {
  // Spawn just inside the reception door so the CEO always starts at the desk.
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const c = p.cells[y * p.w + x];
      if (c.t === DOOR && y < p.h / 2) {
        for (let dy = 1; dy <= 2; dy++) {
          const yy = y + dy;
          if (yy < p.h && p.cells[yy * p.w + x].t === FLOOR) return { x: x + 0.5, z: yy + 0.5 };
        }
      }
    }
  for (let y = 1; y < p.h - 1; y++)
    for (let x = 1; x < p.w - 1; x++)
      if (p.cells[y * p.w + x].t === FLOOR) return { x: x + 0.5, z: y + 0.5 };
  return { x: p.w / 2, z: p.h / 2 };
}
