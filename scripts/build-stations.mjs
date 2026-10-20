// Builds public/stations.json from Overpass (amenity=fuel in WA, OR, ID, MT) + data/overrides.json.
// Run manually (npm run stations) or from ci/refresh-stations.yml; phones never call Overpass.
// RAW_FILE=path reuses a saved Overpass JSON instead of querying.
import fs from 'node:fs';
import { brandKey, membersOnly } from './brands.mjs';
const UA = 'FuelRun-station-builder/0.1 (https://github.com/raimondeee/FuelRun)';
const EPS = (process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter,https://overpass.private.coffee/api/interpreter').split(',');
const q = `[out:json][timeout:240];
area["ISO3166-2"~"^US-(WA|OR|ID|MT)$"]["admin_level"="4"]->.s;
nwr["amenity"="fuel"](area.s);
out center tags;`;
async function fetchOverpass() {
  for (let i = 0, wait = 20000; i < 5; i++, wait *= 2) for (const ep of EPS) {
    const r = await fetch(ep, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }).catch(e => ({ ok: false, status: e.message }));
    if (r.ok) { try { return await r.json(); } catch {} }
    console.error('Overpass', ep, r.status, 'retrying'); await new Promise(s => setTimeout(s, wait));
  }
  throw new Error('Overpass failed');
}
const raw = process.env.RAW_FILE ? JSON.parse(fs.readFileSync(process.env.RAW_FILE)) : await fetchOverpass();
const ov = JSON.parse(fs.readFileSync(new URL('../data/overrides.json', import.meta.url)));
const remove = new Set(ov.remove || []);
const out = [];
for (const e of raw.elements) {
  const id = `${e.type}/${e.id}`;
  if (remove.has(id)) continue;
  const t = { ...e.tags, ...(ov.patch?.[id] || {}) };
  const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
  if (lat == null) continue;
  const k = t.fuelrunBrand ?? brandKey(t);
  out.push([+lat.toFixed(5), +lon.toFixed(5), t.name || t.brand || 'Fuel', t.brand || '', k, membersOnly(k, t)]);
}
for (const a of ov.add || []) out.push([a.lat, a.lon, a.name, a.brand || '', a.key || '', a.members ? 1 : 0]);
if (out.length < 1000) throw new Error('Suspiciously few stations: ' + out.length);
const doc = { generated: new Date().toISOString(), source: '© OpenStreetMap contributors, ODbL', fields: ['lat', 'lon', 'name', 'brand', 'key', 'membersOnly'], stations: out };
fs.writeFileSync(new URL('../public/stations.json', import.meta.url), JSON.stringify(doc));
const c = {}; for (const s of out) if (s[4]) c[s[4]] = (c[s[4]] || 0) + 1;
console.log('stations', out.length, c);
