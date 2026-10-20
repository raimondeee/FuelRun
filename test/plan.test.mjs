// Run: npm test  (bundles src/plan.ts with esbuild, then node --test)
import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, gmapsLegs } from '../.test-build/plan.mjs';
import { brandKey, membersOnly } from '../scripts/brands.mjs';
const SUBARU = [27, 19.3, 100, 25];
let n = 0;
const st = (key, along, off = 0.5, lat) => ({ s: { lat: lat ?? 45 + (n++) * 0.5, lon: -122, name: key || 'Shell', brand: key, key, members: key === 'costco', sa: key === 'sa' }, along, off, idx: 0 });
const sa = (along, off) => st('sa', along, off);
const fb = along => st('', along);

test('regression: McMinnville→Spokane 385 OSRM mi with Subaru must plan a stop (buffered range)', () => {
  const p = plan(385, [fb(200)], ...SUBARU, { topoff: false });
  assert.equal(p.stops.length, 1); assert.ok(p.arrivePct >= 25);
});
test('required stop prefers furthest reachable Space Age over fallback', () => {
  const p = plan(385, [sa(60), sa(240), fb(300)], ...SUBARU, { topoff: false });
  assert.equal(p.stops.length, 1); assert.equal(p.stops[0].along, 240); assert.equal(p.stops[0].kind, 'pref');
});
test('top-off: arrival below 50% adds an optional Space Age stop', () => {
  const p = plan(300, [sa(60), sa(240)], ...SUBARU, { topoff: true });
  assert.ok(p.stops.some(s => s.topoff && s.s.sa));
  assert.equal(plan(300, [sa(60), sa(240)], ...SUBARU, { topoff: false }).stops.length, 0);
});
test('top-off: none when nearly full', () => {
  assert.equal(plan(150, [sa(5), sa(6), sa(7)], ...SUBARU, { topoff: true }).stops.length, 0);
});
test('preferred order: Space Age first, then Maverik, before fallback', () => {
  const S = [st('maverik', 250), st('sa', 120), fb(300)];
  const p = plan(450, S, ...SUBARU, { topoff: false, prefs: ['sa', 'maverik'] });
  assert.equal(p.stops[0].s.key, 'sa');
  const q = plan(450, S, ...SUBARU, { topoff: false, prefs: ['maverik', 'sa'] });
  assert.equal(q.stops[0].s.key, 'maverik');
  const r = plan(450, [st('maverik', 250), fb(300)], ...SUBARU, { topoff: false, prefs: ['sa'] });
  assert.equal(r.stops[0].kind, 'fallback');
});
test('top-off applies to preferred brands', () => {
  const p = plan(300, [st('arco', 200)], ...SUBARU, { topoff: true, prefs: ['sa', 'arco'] });
  assert.equal(p.stops.length, 1); assert.equal(p.stops[0].s.key, 'arco'); assert.ok(p.stops[0].topoff);
});
test('manual stops are visited and the plan recalculates around them', () => {
  const m = fb(100);
  const p = plan(200, [m, sa(150)], ...SUBARU, { topoff: false, manual: [m] });
  assert.equal(p.stops.length, 1); assert.equal(p.stops[0].kind, 'manual');
  assert.ok(Math.abs(p.stops[0].arrivePct - (100 - 100 * 1.05 / 27 / 19.3 * 100)) < 0.5);
  assert.ok(Math.abs(p.arrivePct - (100 - 100 * 1.05 / 27 / 19.3 * 100)) < 0.5);
});
test('brand matching: wikidata, brand, name, conflicting brand, Costco members-only, tribal conservative', () => {
  assert.equal(brandKey({ brand: 'Maverik' }), 'maverik');
  assert.equal(brandKey({ brand: 'ARCO', name: 'ARCO' }), 'arco');
  assert.equal(brandKey({ name: 'Arco ampm' }), 'arco');
  assert.equal(brandKey({ brand: 'Costco', name: 'Costco Gasoline' }), 'costco');
  assert.equal(membersOnly('costco', {}), 1);
  assert.equal(brandKey({ brand: 'Chevron', 'brand:wikidata': 'Q319642', name: 'Space Age' }), '');
  assert.equal(brandKey({ name: 'Space Age' }), 'sa');
  assert.equal(brandKey({ name: 'Archco Fuel' }), '');
  assert.equal(brandKey({ operator: 'Tulalip Tribes' }), 'tribal');
  assert.equal(brandKey({ name: 'Spokane Shell', brand: 'Shell', 'brand:wikidata': 'Q110716465' }), '');
  assert.equal(brandKey({ name: 'Puyallup Chevron' }), '');
  assert.equal(brandKey({ name: 'Yakama Nation Legends Casino Fuel' }), 'tribal');
});
test('Google legs: ≤3 waypoints, chained, %7C, <2048 chars', () => {
  const pts = Array.from({ length: 11 }, (_, i) => [45 + i / 10, -122 - i / 10]);
  const L = gmapsLegs(pts); assert.equal(L.length, 3);
  for (let i = 0; i < L.length; i++) {
    const q = new URL(L[i]).searchParams; assert.ok(L[i].length < 2048);
    assert.ok((q.get('waypoints') || '').split('|').length <= 3);
    if (i) assert.equal(q.get('origin'), new URL(L[i - 1]).searchParams.get('destination'));
  }
  assert.match(L[0], /%7C/);
});
