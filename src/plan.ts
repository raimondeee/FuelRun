import { CONFIG } from './config';
export type Station = { lat: number; lon: number; name: string; brand: string; key: string; members: boolean; sa: boolean };
export type Proj = { s: Station; along: number; off: number; idx: number }; // along: miles; off: km
export type Stop = { s: Station; along: number; detourMi: number; milesFromPrev: number; arriveGal: number; arrivePct: number; kind: 'pref' | 'fallback' | 'manual'; topoff: boolean; warn?: string; idx: number };
export type Plan = { stops: Stop[]; totalMi: number; arriveGal: number; arrivePct: number; warnings: string[] };
export type Opts = { topoff?: boolean; buffer?: number; prefs?: string[]; manual?: Proj[] };
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
 * prefs: ordered preferred brand keys (default ['sa']). Required stops: when the next target
 * (next manual stop or B) can't be reached above the reserve, try each preferred brand in order —
 * furthest-along reachable on the route, then via short detour — and only then any-brand fallback.
 * Manual stops (opts.manual) are always visited; the plan recalculates around them.
 * Optional top-offs (opts.topoff): as before, but for any preferred brand (in preference order),
 * at most one per cluster, only if you'd arrive at ≤ topOffMaxStartPct.
 */
export function plan(total: number, proj: Proj[], mpg: number, tank: number, startPct: number, reservePct: number, opts: Opts = {}): Plan {
  const buf = opts.buffer ?? CONFIG.distBuffer, topoff = opts.topoff ?? true, prefs = opts.prefs ?? ['sa'];
  const manual = [...(opts.manual || [])].sort((a, b) => a.along - b.along);
  const use = (mi: number) => mi * buf / mpg;
  const reserve = tank * reservePct / 100;
  let fuel = tank * startPct / 100, pos = 0, extra = 0;
  const stops: Stop[] = [], warnings: string[] = [];
  const used: Station[] = [];
  const sameCluster = (s: Station) => used.some(u => hav(u.lat, u.lon, s.lat, s.lon) <= CONFIG.clusterKm);
  const isPref = (s: Station) => prefs.includes(s.key);
  const rank = (s: Station) => { const i = prefs.indexOf(s.key); return i < 0 ? 99 : i; };
  const label = (s: Station) => s.name;
  if (fuel <= reserve) warnings.push(`Starting fuel (${startPct}%) is at or below the ${reservePct}% reserve — first stop uses reserve fuel.`);
  const push = (p: Proj, kind: Stop['kind'], isTop: boolean, warn?: string) => {
    const d = detMi(p), miles = p.along - pos + extra + d;
    fuel -= use(miles);
    stops.push({ s: p.s, along: p.along, detourMi: d, milesFromPrev: miles, arriveGal: fuel, arrivePct: fuel / tank * 100, kind, topoff: isTop, warn, idx: p.idx });
    if (fuel < reserve - 1e-9 && kind === 'manual') warn = (warn ? warn + ' ' : '') + `Arrives below the ${reservePct}% reserve.`, stops[stops.length - 1].warn = warn;
    if (fuel < 0) warnings.push(`You'd run out of fuel before stop ${stops.length} (${label(p.s)}).`);
    if (warn && !isTop) warnings.push(`Stop ${stops.length} (${label(p.s)}): ${warn}`);
    if (isPref(p.s)) used.push(p.s);
    fuel = tank; pos = p.along; extra = d;
  };
  for (let guard = 0; guard < 60; guard++) {
    const next = manual.find(m => m.along >= pos && !stops.some(s => s.s === m.s));
    const tAlong = next ? next.along : total, tExtra = next ? detMi(next) : 0;
    const arriveT = fuel - use(tAlong - pos + extra + tExtra);
    const lowStart = fuel <= reserve && stops.length === 0;
    const usable = lowStart ? fuel : fuel - reserve;
    const limit = pos + usable * mpg / buf - extra;
    const minAlong = stops.length ? pos + CONFIG.minHopMi : pos;
    const fuelAt = (p: Proj) => fuel - use(p.along - pos + extra + detMi(p));
    // best = lowest preference rank, then furthest along
    const pick = (pred: (p: Proj) => boolean, byRank = false) => {
      let b: Proj | undefined;
      for (const p of proj) if (pred(p) && p.along > minAlong && p.along < tAlong && p.along + detMi(p) <= limit &&
        (!b || (byRank ? rank(p.s) < rank(b.s) || (rank(p.s) === rank(b.s) && p.along > b.along) : p.along > b.along))) b = p;
      return b;
    };
    const on = (p: Proj) => p.off <= CONFIG.onRouteKm;
    if (arriveT >= reserve) {
      if (topoff) {
        const low = arriveT / tank * 100 < CONFIG.topOffBelowPct;
        const p = pick(q => isPref(q.s) && !sameCluster(q.s) && q.along <= tAlong - CONFIG.topOffMinBeforeMi && fuelAt(q) / tank * 100 <= CONFIG.topOffMaxStartPct && detMin(q) <= (low ? CONFIG.topOffLowMaxMin : CONFIG.topOffMaxMin), true);
        if (p) { push(p, 'pref', true, detMi(p) > 0 ? `Optional top-off: detour ≈${detMi(p).toFixed(1)} mi (~${detMin(p).toFixed(0)} min round trip).` : undefined); continue; }
      }
      if (!next) break;
      push(next, 'manual', false); continue;
    }
    let p: Proj | undefined, kind: Stop['kind'] = 'pref', warn: string | undefined;
    for (const k of prefs) {
      p = pick(q => q.s.key === k && on(q)); if (p) break;
      p = pick(q => q.s.key === k); if (p) { warn = `Detour ≈${detMi(p).toFixed(1)} mi each way to reach this ${p.s.name}.`; break; }
    }
    if (!p) { kind = 'fallback'; p = pick(on); if (p) warn = 'No preferred-brand station reachable within reserve — fallback station.'; }
    if (!p) { p = pick(() => true); if (p) warn = `No preferred-brand station reachable — fallback station with ≈${detMi(p).toFixed(1)} mi detour each way.`; }
    if (!p) {
      if (next) { warnings.push(`Manual stop ${label(next.s)} can't be reached above the reserve and no station is reachable before it.`); push(next, 'manual', false); continue; }
      warnings.push(`No station of any brand reachable from mile ${pos.toFixed(0)}. Fuel up before this point!`); break;
    }
    if (p.s.members) warn = (warn ? warn + ' ' : '') + 'Members only.';
    if (lowStart) warn = (warn ? warn + ' ' : '') + 'Reached using reserve fuel.';
    push(p, kind, false, warn);
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
