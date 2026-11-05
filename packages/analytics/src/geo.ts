export type LngLat = [number, number];
export type Ring = LngLat[];

const EARTH_RADIUS_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Distance géodésique sur la sphère, en kilomètres. */
export function distanceKm(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Point atteint depuis `from` selon un cap en degrés et une distance en kilomètres. */
export function destination(from: LngLat, bearingDeg: number, km: number): LngLat {
  const d = km / EARTH_RADIUS_KM;
  const b = rad(bearingDeg);
  const lat1 = rad(from[1]);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 = rad(from[0]) + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [deg(lng2), deg(lat2)];
}

/** Cercle géodésique fermé, utilisable comme anneau GeoJSON. */
export function circle(center: LngLat, km: number, steps = 64): Ring {
  const ring: Ring = [];
  for (let i = 0; i < steps; i++) ring.push(destination(center, (i / steps) * 360, km));
  ring.push(ring[0] as LngLat);
  return ring;
}

/** Test du point dans un polygone par lancer de rayon. */
export function pointInRing(p: LngLat, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i] as LngLat;
    const b = ring[j] as LngLat;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Distance en kilomètres du point au segment, approchée sur un plan local. */
export function distanceToSegmentKm(p: LngLat, a: LngLat, b: LngLat): number {
  const k = Math.cos(rad(p[1]));
  const ax = (a[0] - p[0]) * k, ay = a[1] - p[1];
  const bx = (b[0] - p[0]) * k, by = b[1] - p[1];
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
  return distanceKm(p, [p[0] + (ax + t * dx) / k, p[1] + ay + t * dy]);
}

export function distanceToLineKm(p: LngLat, line: LngLat[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) best = Math.min(best, distanceToSegmentKm(p, line[i] as LngLat, line[i + 1] as LngLat));
  return best;
}
