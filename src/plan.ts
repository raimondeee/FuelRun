import { CONFIG } from './config';
export type Station = { lat: number; lon: number; name: string; brand: string; sa: boolean };
export type Proj = { s: Station; along: number; off: number; idx: number }; // along: miles; off: km
export type Stop = { s: Station; along: number; detourMi: number; milesFromPrev: number; arriveGal: number; arrivePct: number; kind: 'sa' | 'fallback'; topoff: boolean; warn?: string; idx: number };
export type Plan = { stops: Stop[]; totalMi: number; arriveGal: number; arrivePct: number; warnings: string[] };
export type Opts = { topoff?: boolean; buffer?: number };
const KM = 0.621371;
export function hav(a: number, b: number, c: number, d: number) {
  const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x)); // km
}
/** coords: [lon,lat][] from OSRM. Returns cumulative miles and stations within the detour radius, projected onto the route. */
export function project(coords: number[][], stations: Station[]) {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + hav(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]) * KM);
  const g = new Map<string, number[]>();
  coords.forEach((c, i) => { const k = `${Math.floor(c[1] * 10)},${Math.floor(c[0] * 10)}`; (g.get(k) || g.set(k, []).get(k)!).push(i); });
  const out: Proj[] = [];
  for (const s of stations) {
    const ky = Math.floor(s.lat * 10), kx = Math.floor(s.lon * 10);
    let best = 1e9, bi = -1;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) for (const i of g.get(`${ky + dy},${kx + dx}`) || []) {
      const d = hav(s.lat, s.lon, coords[i][1], coords[i][0]); if (d < best) { best = d; bi = i; }
    }
    if (bi >= 0 && best <= CONFIG.detourKm) out.push({ s, along: cum[bi], off: best, idx: bi });
  }
  return { cum, proj: out.sort((a, b) => a.along - b.along) };
}
/** Road miles each way to leave the route and come back (0 if on the route corridor). */
export const detMi = (p: Proj) => p.off <= CONFIG.onRouteKm ? 0 : p.off * KM * CONFIG.detourFactor;
export const detMin = (p: Proj) => 2 * detMi(p) / CONFIG.detourMph * 60;

/**
 * Plan stops. Fuel use is computed on route miles × buffer (default CONFIG.distBuffer).
 * Required stops: when B can't be reached above the reserve, take the furthest-along reachable
 * Space Age (on route, then short detour); only if none, a fallback of any brand.
 * Optional top-offs (opts.topoff): when B is reachable but you'd arrive below topOffBelowPct, or a
 * Space Age is within topOffMaxMin of detour, stop at the furthest-along reachable Space Age —
 * at most one per Space Age cluster, and only if you'd arrive there at ≤ topOffMaxStartPct.
 */
export function plan(total: number, proj: Proj[], mpg: number, tank: number, startPct: number, reservePct: number, opts: Opts = {}): Plan {
  const buf = opts.buffer ?? CONFIG.distBuffer, topoff = opts.topoff ?? true;
  const use = (mi: number) => mi * buf / mpg; // gallons for road miles
  const reserve = tank * reservePct / 100;
  let fuel = tank * startPct / 100, pos = 0, extra = 0; // extra: miles to rejoin route after a detour
  const stops: Stop[] = [], warnings: string[] = [];
  const usedClusters: Station[] = [];
  const sameCluster = (s: Station) => usedClusters.some(u => hav(u.lat, u.lon, s.lat, s.lon) <= CONFIG.clusterKm);
  if (fuel <= reserve) warnings.push(`Starting fuel (${startPct}%) is at or below the ${reservePct}% reserve — first stop uses reserve fuel.`);
  for (let guard = 0; guard < 50; guard++) {
    const arriveB = fuel - use(total - pos + extra);
    const lowStart = fuel <= reserve && stops.length === 0;
    const usable = lowStart ? fuel : fuel - reserve;
    const limit = pos + usable * mpg / buf - extra; // furthest along-route mile reachable above reserve
    const minAlong = stops.length ? pos + CONFIG.minHopMi : pos;
    const fuelAt = (p: Proj) => fuel - use(p.along - pos + extra + detMi(p));
    const pick = (pred: (p: Proj) => boolean) => {
      let b: Proj | undefined;
      for (const p of proj) if (pred(p) && p.along > minAlong && p.along < total && p.along + detMi(p) <= limit && (!b || p.along > b.along)) b = p;
      return b;
    };
    const on = (p: Proj) => p.off <= CONFIG.onRouteKm;
    let p: Proj | undefined, kind: 'sa' | 'fallback' = 'sa', warn: string | undefined, isTop = false;
    if (arriveB >= reserve) {
      if (!topoff) break;
      const low = arriveB / tank * 100 < CONFIG.topOffBelowPct;
      const ok = (q: Proj) => q.s.sa && !sameCluster(q.s) && fuelAt(q) / tank * 100 <= CONFIG.topOffMaxStartPct && detMin(q) <= (low ? CONFIG.topOffLowMaxMin : CONFIG.topOffMaxMin);
      p = pick(ok);
      if (!p) break;
      isTop = true;
      if (detMi(p) > 0) warn = `Optional top-off: detour ≈${detMi(p).toFixed(1)} mi (~${detMin(p).toFixed(0)} min round trip).`;
    } else {
      p = pick(q => q.s.sa && on(q));
      if (!p) { p = pick(q => q.s.sa); if (p) warn = `Detour ≈${detMi(p).toFixed(1)} mi each way to reach this Space Age.`; }
      if (!p) { kind = 'fallback'; p = pick(on); if (p) warn = 'No Space Age reachable within reserve — fallback station.'; }
      if (!p) { p = pick(() => true); if (p) warn = `No Space Age reachable — fallback station with ≈${detMi(p).toFixed(1)} mi detour each way.`; }
      if (!p) { warnings.push(`No station of any brand reachable from mile ${pos.toFixed(0)}. Fuel up before this point!`); break; }
      if (lowStart) warn = (warn ? warn + ' ' : '') + 'Reached using reserve fuel.';
    }
    const d = detMi(p), miles = p.along - pos + extra + d;
    fuel -= use(miles);
    stops.push({ s: p.s, along: p.along, detourMi: d, milesFromPrev: miles, arriveGal: fuel, arrivePct: fuel / tank * 100, kind, topoff: isTop, warn, idx: p.idx });
    if (warn && !isTop) warnings.push(`Stop ${stops.length} (${p.s.name}): ${warn}`);
    if (p.s.sa) usedClusters.push(p.s);
    fuel = tank; pos = p.along; extra = d;
  }
  const last = total - pos + extra; fuel -= use(last);
  return { stops, totalMi: total + stops.reduce((a, s) => a + 2 * s.detourMi, 0), arriveGal: fuel, arrivePct: fuel / tank * 100, warnings };
}
/** Chain Google Maps directions links, ≤3 waypoints each, each leg starting at the previous leg's end. */
export function gmapsLegs(pts: [number, number][]): string[] {
  const f = (p: [number, number]) => `${p[0].toFixed(5)}%2C${p[1].toFixed(5)}`;
  const legs: string[] = [];
  for (let i = 0; i < pts.length - 1; i += 4) {
    const seg = pts.slice(i, Math.min(i + 5, pts.length));
    const wp = seg.slice(1, -1).map(f).join('%7C');
    let u = `https://www.google.com/maps/dir/?api=1&origin=${f(seg[0])}&destination=${f(seg[seg.length - 1])}&travelmode=driving`;
    if (wp) u += `&waypoints=${wp}`;
    if (u.length >= 2048) throw new Error('Maps URL too long');
    legs.push(u);
    if (i + 4 >= pts.length - 1) break;
  }
  return legs;
}
