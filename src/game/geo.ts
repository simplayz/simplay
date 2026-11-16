/** GDD §14.3 — geodesy helpers. All distances in km, all maths small-angle. */

export const KM_PER_DEG_LAT = 110.574;
export const KM_PER_DEG_LNG_EQUATOR = 111.32;

export const kmToDegLat = (km: number) => km / KM_PER_DEG_LAT;
export const kmToDegLng = (km: number, lat: number) =>
  km / (KM_PER_DEG_LNG_EQUATOR * Math.max(0.12, Math.cos((lat * Math.PI) / 180)));

export interface LL {
  lat: number;
  lng: number;
}

export function haversineKm(a: LL, b: LL): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Axis-aligned claim box (GDD §2.2: axis-aligned so claims tile without gaps). */
export function claimCorners(center: LL, sideKm: number): [number, number][] {
  const dLat = kmToDegLat(sideKm / 2);
  const dLng = kmToDegLng(sideKm / 2, center.lat);
  return [
    [center.lat - dLat, center.lng - dLng],
    [center.lat - dLat, center.lng + dLng],
    [center.lat + dLat, center.lng + dLng],
    [center.lat + dLat, center.lng - dLng],
  ];
}

export function offsetLL(c: LL, dxKm: number, dyKm: number): LL {
  return { lat: c.lat + kmToDegLat(dyKm), lng: c.lng + kmToDegLng(dxKm, c.lat) };
}

/**
 * Road routing. GDD §10: shortest-path with two manhattan bends + a survey
 * jitter so roads read as engineered, not as debug lines.
 * Real OSM-way snapping is an open question (q8) — see the register.
 */
export function roadPath(a: LL, b: LL, seed = 1): [number, number][] {
  const r = mulberry32(seed * 9176 + 13);
  const midLat = a.lat + (b.lat - a.lat) * (0.35 + r() * 0.3);
  const midLng = a.lng + (b.lng - a.lng) * (0.35 + r() * 0.3);
  return [
    [a.lat, a.lng],
    [a.lat, midLng],
    [midLat, midLng],
    [midLat, b.lng],
    [b.lat, b.lng],
  ];
}

export function formatLL(p: LL): string {
  const ns = p.lat >= 0 ? "N" : "S";
  const ew = p.lng >= 0 ? "E" : "W";
  return `${Math.abs(p.lat).toFixed(4)}° ${ns}  ${Math.abs(p.lng).toFixed(4)}° ${ew}`;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
