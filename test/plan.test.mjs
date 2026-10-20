// Run: npm test  (bundles src/plan.ts with esbuild, then node --test)
import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, gmapsLegs } from '../.test-build/plan.mjs';
const SUBARU = [27, 19.3, 100, 25];
const sa = (along, off = 0.5, name = 'Space Age') => ({ s: { lat: 45, lon: -122, name, brand: 'Space Age', sa: true }, along, off, idx: 0 });
const fb = (along) => ({ s: { lat: 46, lon: -119, name: 'Shell', brand: 'Shell', sa: false }, along, off: 0.5, idx: 0 });

test('regression: McMinnville→Spokane 385 OSRM mi with Subaru must plan a stop (buffered range)', () => {
  // OSRM says 385 mi; unbuffered math arrives at 26% (> 25% reserve) and planned no stop.
  const p = plan(385, [fb(200)], ...SUBARU, { topoff: false });
  assert.equal(p.stops.length, 1, 'a required stop must be planned');
  assert.ok(p.arrivePct >= 25);
});
test('required stop prefers furthest reachable Space Age over fallback', () => {
  const p = plan(385, [sa(60), sa(240), fb(300)], ...SUBARU, { topoff: false });
  assert.equal(p.stops.length, 1); assert.equal(p.stops[0].along, 240); assert.equal(p.stops[0].kind, 'sa');
});
test('top-off: arrival below 50% adds an optional Space Age stop', () => {
  const p = plan(300, [sa(60), sa(240)], ...SUBARU, { topoff: true });
  assert.ok(p.stops.some(s => s.topoff && s.s.sa));
  const off = plan(300, [sa(60), sa(240)], ...SUBARU, { topoff: false });
  assert.equal(off.stops.length, 0);
});
test('top-off: at most one per cluster, none when nearly full', () => {
  const p = plan(150, [sa(5), sa(6), sa(7)], ...SUBARU, { topoff: true });
  assert.equal(p.stops.length, 0); // would arrive ~99% — pointless
});
test('Google legs: ≤3 waypoints, chained, %7C, <2048 chars', () => {
  const pts = Array.from({ length: 11 }, (_, i) => [45 + i / 10, -122 - i / 10]);
  const L = gmapsLegs(pts);
  assert.equal(L.length, 3);
  for (let i = 0; i < L.length; i++) {
    const q = new URL(L[i]).searchParams; assert.ok(L[i].length < 2048);
    assert.ok((q.get('waypoints') || '').split('|').length <= 3);
    if (i) assert.equal(q.get('origin'), new URL(L[i - 1]).searchParams.get('destination'));
  }
  assert.match(L[0], /%7C/);
});
