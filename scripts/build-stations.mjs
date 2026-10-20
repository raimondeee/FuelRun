// Builds public/stations.json from Overpass (amenity=fuel in WA, OR, ID, MT) + data/overrides.json.
// Run in CI weekly; phones never call Overpass.
import fs from 'node:fs';
const UA = 'FuelRun-station-builder/0.1 (https://github.com/raimondeee/FuelRun)';
const EP = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const q = `[out:json][timeout:300];
area["ISO3166-2"~"^US-(WA|OR|ID|MT)$"]["admin_level"="4"]->.s;
nwr["amenity"="fuel"](area.s);
out center tags;`;
const SA = /space\s*age/i;
async function fetchOverpass() {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(EP, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
    if (r.ok) return r.json();
    console.error('Overpass', r.status, 'retrying'); await new Promise(s => setTimeout(s, 30000));
  }
  throw new Error('Overpass failed');
}
const raw = await fetchOverpass();
const ov = JSON.parse(fs.readFileSync(new URL('../data/overrides.json', import.meta.url)));
const remove = new Set(ov.remove || []);
const out = [];
for (const e of raw.elements) {
  const id = `${e.type}/${e.id}`;
  if (remove.has(id)) continue;
  const t = { ...e.tags, ...(ov.patch?.[id] || {}) };
  const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
  if (lat == null) continue;
  const brand = t.brand || '';
  const name = t.name || brand || 'Fuel';
  const sa = SA.test(brand) || SA.test(name) || t['brand:wikidata'] === 'Q138718151' || t.spaceAge === true ? 1 : 0;
  out.push([+lat.toFixed(5), +lon.toFixed(5), name, brand, sa]);
}
for (const a of ov.add || []) out.push([a.lat, a.lon, a.name, a.brand || '', a.spaceAge ? 1 : 0]);
if (out.length < 1000) throw new Error('Suspiciously few stations: ' + out.length);
const doc = { generated: new Date().toISOString(), source: '© OpenStreetMap contributors, ODbL', fields: ['lat', 'lon', 'name', 'brand', 'spaceAge'], stations: out };
fs.writeFileSync(new URL('../public/stations.json', import.meta.url), JSON.stringify(doc));
console.log('stations', out.length, 'spaceAge', out.filter(s => s[4]).length);
