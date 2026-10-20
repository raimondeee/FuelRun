import 'leaflet/dist/leaflet.css';
import './style.css';
import L from 'leaflet';
import { CONFIG, DEFAULT_CAR } from './config';
import { project, plan, gmapsLegs, Station, Proj, detMi, detMin } from './plan';
import { BRANDS, DEFAULT_PREFS, FALLBACK_COLOR, brandOf, BrandKey } from './brands';

type Car = { name: string; mpg: number; tank: number; reserve: number };
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const inp = (id: string) => $<HTMLInputElement>(id);
const ls = { get: <T>(k: string, d: T): T => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch { return d; } }, set: (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v)) };
const status = (t: string) => ($('status').textContent = t);
function esc(s: string) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); }

// ---------- vehicles ----------
let cars: Car[] = ls.get('fr.cars', [DEFAULT_CAR]);
if (!cars.length) cars = [DEFAULT_CAR];
let defName: string = ls.get('fr.defaultCar', cars.some(c => c.name === DEFAULT_CAR.name) ? DEFAULT_CAR.name : cars[0].name);
let editing: number | null = null; // index, or -1 for new
const carSel = $<HTMLSelectElement>('car');
const curCar = () => cars[+carSel.value] || cars[0];
function renderCars(selName?: string) {
  const name = selName ?? defName;
  carSel.innerHTML = cars.map((c, i) => `<option value="${i}">${c.name === defName ? '★ ' : ''}${esc(c.name)} · ${c.mpg} mpg · ${c.tank} gal</option>`).join('');
  const i = cars.findIndex(c => c.name === name); carSel.value = String(i >= 0 ? i : 0);
  inp('reserve').value = String(curCar().reserve ?? 25);
}
carSel.onchange = () => { inp('reserve').value = String(curCar().reserve ?? 25); closeEdit(); replan(); };
function openEdit(i: number) {
  editing = i; const c = i >= 0 ? cars[i] : { name: '', mpg: NaN, tank: NaN, reserve: 25 };
  $('caredit-title').textContent = i >= 0 ? 'Edit vehicle' : 'Add vehicle';
  inp('carname').value = c.name; inp('mpg').value = isNaN(c.mpg) ? '' : String(c.mpg); inp('tank').value = isNaN(c.tank) ? '' : String(c.tank);
  $('caredit').hidden = false; inp('carname').focus();
}
function closeEdit() { editing = null; $('caredit').hidden = true; }
$('editcar').onclick = () => openEdit(+carSel.value);
$('newcar').onclick = () => openEdit(-1);
$('cancelcar').onclick = closeEdit;
$('savecar').onclick = () => {
  const c: Car = { name: inp('carname').value.trim(), mpg: +inp('mpg').value, tank: +inp('tank').value, reserve: +inp('reserve').value || 25 };
  if (!c.name || !(c.mpg > 0) || !(c.tank > 0)) return status('Vehicle needs a name, MPG and tank size.');
  if (editing !== null && editing >= 0) { const old = cars[editing].name; cars[editing] = c; if (defName === old) defName = c.name; }
  else { const j = cars.findIndex(x => x.name === c.name); if (j >= 0) cars[j] = c; else cars.push(c); }
  ls.set('fr.cars', cars); ls.set('fr.defaultCar', defName); renderCars(c.name); closeEdit(); status(`Saved vehicle “${c.name}”.`);
};
$('defcar').onclick = () => { defName = curCar().name; ls.set('fr.defaultCar', defName); renderCars(defName); status(`Default vehicle: ${defName}`); };
$('delcar').onclick = () => {
  if (cars.length <= 1) return status('Keep at least one vehicle.');
  const [c] = cars.splice(+carSel.value, 1); if (c.name === defName) defName = cars[0].name;
  ls.set('fr.cars', cars); ls.set('fr.defaultCar', defName); renderCars(defName);
};
renderCars();

// fueleconomy.gov lookup (CORS: Access-Control-Allow-Origin: *)
const FE = 'https://www.fueleconomy.gov/ws/rest';
async function feMenu(path: string): Promise<{ text: string; value: string }[]> {
  const r = await fetch(`${FE}/${path}`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('fueleconomy.gov ' + r.status);
  const j = await r.json(); const m = j?.menuItem; return !m ? [] : Array.isArray(m) ? m : [m];
}
const fill = (sel: HTMLSelectElement, items: { text: string; value: string }[], ph: string) => {
  sel.innerHTML = `<option value="">${ph}</option>` + items.map(i => `<option value="${esc(i.value)}">${esc(i.text)}</option>`).join(''); sel.disabled = !items.length;
};
const ly = $<HTMLSelectElement>('ly'), lm = $<HTMLSelectElement>('lm'), lmo = $<HTMLSelectElement>('lmo'), lo = $<HTMLSelectElement>('lo');
$('lookup').addEventListener('toggle', async () => {
  if (ly.options.length) return;
  try { fill(ly, await feMenu('vehicle/menu/year'), 'Year'); } catch (e) { $('lres').textContent = 'Lookup unavailable: ' + (e as Error).message; }
});
ly.onchange = async () => { fill(lm, [], 'Make'); fill(lmo, [], 'Model'); fill(lo, [], 'Version'); if (ly.value) fill(lm, await feMenu(`vehicle/menu/make?year=${ly.value}`), 'Make'); };
lm.onchange = async () => { fill(lmo, [], 'Model'); fill(lo, [], 'Version'); if (lm.value) fill(lmo, await feMenu(`vehicle/menu/model?year=${ly.value}&make=${encodeURIComponent(lm.value)}`), 'Model'); };
lmo.onchange = async () => {
  fill(lo, [], 'Version'); if (!lmo.value) return;
  const opts = await feMenu(`vehicle/menu/options?year=${ly.value}&make=${encodeURIComponent(lm.value)}&model=${encodeURIComponent(lmo.value)}`);
  fill(lo, opts, 'Version'); if (opts.length === 1) { lo.value = opts[0].value; lo.onchange!(new Event('change')); }
};
lo.onchange = async () => {
  if (!lo.value) return;
  const r = await fetch(`${FE}/vehicle/${lo.value}`, { headers: { Accept: 'application/json' } }); const v = await r.json();
  inp('mpg').value = String(v.highway08);
  if (!inp('carname').value.trim()) inp('carname').value = `${v.year} ${v.make} ${v.model}`;
  $('lres').textContent = `${v.year} ${v.make} ${v.model}: ${v.highway08} hwy / ${v.city08} city / ${v.comb08} combined MPG. Filled highway MPG. Enter tank gallons by hand.`;
};

// ---------- preferred brands ----------
let prefs: { key: BrandKey; on: boolean }[] = ls.get('fr.prefs', DEFAULT_PREFS);
for (const b of DEFAULT_PREFS) if (!prefs.some(p => p.key === b.key)) prefs.push({ ...b });
prefs = prefs.filter(p => brandOf(p.key));
const activePrefs = () => prefs.filter(p => p.on).map(p => p.key as string);
function renderPrefs() {
  $('prefs').innerHTML = prefs.map((p, i) => { const b = brandOf(p.key)!; return `<li><label><input type="checkbox" data-i="${i}" ${p.on ? 'checked' : ''}/><i class="dot" style="background:${b.color}"></i>${esc(b.label)}${b.note ? ` <small>(${b.note})</small>` : ''}</label>
    <button type="button" class="sec" data-up="${i}" ${i ? '' : 'disabled'} aria-label="Move up">▲</button><button type="button" class="sec" data-down="${i}" ${i < prefs.length - 1 ? '' : 'disabled'} aria-label="Move down">▼</button></li>`; }).join('');
  $('prefs').querySelectorAll<HTMLInputElement>('input').forEach(c => c.onchange = () => { prefs[+c.dataset.i!].on = c.checked; savePrefs(); });
  $('prefs').querySelectorAll<HTMLButtonElement>('button').forEach(b => b.onclick = () => {
    const i = +(b.dataset.up ?? b.dataset.down!), j = b.dataset.up !== undefined ? i - 1 : i + 1;
    [prefs[i], prefs[j]] = [prefs[j], prefs[i]]; savePrefs(); renderPrefs();
  });
}
function savePrefs() { ls.set('fr.prefs', prefs); if (last) replan(); }
renderPrefs();
const topEl = inp('topoff');
topEl.checked = ls.get('fr.topoff', true);
topEl.onchange = () => { ls.set('fr.topoff', topEl.checked); if (last) replan(); };

// ---------- recent trips ----------
function renderRecent() {
  const r: [string, string][] = ls.get('fr.recent', []);
  $('recent').innerHTML = r.length ? '<small>Recent:</small><br>' + r.map((t, i) => `<button type="button" data-i="${i}">${esc(t[0])} → ${esc(t[1])}</button>`).join('') : '';
  $('recent').querySelectorAll<HTMLButtonElement>('button').forEach(b => b.onclick = () => { const t = r[+b.dataset.i!]; inp('a').value = t[0]; inp('b').value = t[1]; });
}
renderRecent();

// ---------- map (bottom of page; one-finger drag disabled on touch so the page scrolls) ----------
const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
let map: L.Map | null = null, layer: L.LayerGroup;
function ensureMap() {
  if (map) return map;
  $('mapwrap').hidden = false;
  map = L.map('map', { dragging: !touch, scrollWheelZoom: false, touchZoom: true, tapHold: false } as L.MapOptions).setView([45.6, -120.5], 6);
  L.tileLayer(CONFIG.tiles, { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
  layer = L.layerGroup().addTo(map);
  if (touch) { // two-finger pan: enable dragging only while 2+ fingers are down
    const el = map.getContainer();
    el.addEventListener('touchstart', e => { if (e.touches.length > 1) map!.dragging.enable(); }, { passive: true });
    el.addEventListener('touchend', e => { if (e.touches.length < 2) map!.dragging.disable(); }, { passive: true });
  }
  return map;
}
const colorOf = (s: Station) => brandOf(s.key)?.color ?? FALLBACK_COLOR;
const dot = (ll: L.LatLngExpression, color: string, r = 9, ring = '#fff') => L.circleMarker(ll, { radius: r, color: ring, weight: ring === '#fff' ? 2 : 3, fillColor: color, fillOpacity: 1 });
function renderLegend(keys: string[]) {
  $('legend').innerHTML = BRANDS.filter(b => keys.includes(b.key)).map(b => `<span><i class="dot" style="background:${b.color}"></i>${esc(b.label)}</span>`).join('') +
    `<span><i class="dot" style="background:${FALLBACK_COLOR}"></i>Fallback (other brand)</span><span><i class="dot ab"></i>A / B</span><span><i class="dot" style="background:#fff;box-shadow:0 0 0 2px #111"></i>Manual stop</span>`;
}

// ---------- data ----------
let stationsP: Promise<Station[]> | null = null;
const stations = () => stationsP ??= fetch(import.meta.env.BASE_URL + 'stations.json').then(r => r.json()).then(d => d.stations.map((s: any[]) => ({ lat: s[0], lon: s[1], name: s[2], brand: s[3], key: s[4] || '', members: !!s[5], sa: s[4] === 'sa' })));
async function geocode(q: string): Promise<[number, number, string]> {
  const key = 'fr.geo.' + q.trim().toLowerCase(); const c = ls.get<[number, number, string] | null>(key, null); if (c) return c;
  const r = await fetch(`${CONFIG.nominatim}?format=jsonv2&limit=1&countrycodes=us,ca&q=${encodeURIComponent(q)}`, { referrerPolicy: 'strict-origin-when-cross-origin' });
  if (!r.ok) throw new Error('Geocoder error ' + r.status);
  const j = await r.json(); if (!j[0]) throw new Error(`Couldn't find “${q}”`);
  const v: [number, number, string] = [+j[0].lat, +j[0].lon, j[0].display_name]; ls.set(key, v); return v;
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type Trip = { A: [number, number, string]; B: [number, number, string]; coords: number[][]; total: number; proj: Proj[]; dur: number };
let last: Trip | null = null;
let manual = new Set<Station>();
let showAll = false;

$('f').onsubmit = async e => {
  e.preventDefault(); $<HTMLButtonElement>('go').disabled = true; $('out').innerHTML = '';
  try {
    const qa = inp('a').value, qb = inp('b').value;
    status('Finding addresses…');
    const A = await geocode(qa); await sleep(1100); const B = await geocode(qb);
    status('Routing…');
    const rr = await fetch(`${CONFIG.osrm}/${A[1]},${A[0]};${B[1]},${B[0]}?overview=full&geometries=geojson`);
    if (!rr.ok) throw new Error('Routing error ' + rr.status);
    const route = (await rr.json()).routes?.[0]; if (!route) throw new Error('No route found');
    const coords: number[][] = route.geometry.coordinates;
    const { cum, proj } = project(coords, await stations());
    last = { A, B, coords, total: cum[cum.length - 1], proj, dur: route.duration }; manual = new Set(); showAll = false;
    const recent: [string, string][] = ls.get('fr.recent', []);
    ls.set('fr.recent', [[qa, qb], ...recent.filter(t => t[0] !== qa || t[1] !== qb)].slice(0, 6)); renderRecent();
    replan(true);
    status('Done.');
  } catch (err) { status('⚠️ ' + (err as Error).message); }
  finally { $<HTMLButtonElement>('go').disabled = false; }
};

function replan(fit = false) {
  if (!last) return;
  const { A, B, coords, total, proj, dur } = last;
  const car = curCar(), mpg = car.mpg, tank = car.tank, start = +inp('start').value, reserve = +inp('reserve').value;
  const pk = activePrefs();
  const man = proj.filter(q => manual.has(q.s));
  const p = plan(total, proj, mpg, tank, start, reserve, { topoff: topEl.checked, prefs: pk, manual: man });
  const onRoute = proj.filter(q => pk.includes(q.s.key));
  const listed = onRoute.filter(q => showAll || manual.has(q.s) || detMin(q) <= CONFIG.listMaxMin);
  const inPlan = new Set(p.stops.map(s => s.s));
  // map
  const m = ensureMap(); layer.clearLayers();
  const line = L.polyline(coords.map(c => [c[1], c[0]] as [number, number]), { color: '#0b3d91', weight: 4 }).addTo(layer);
  for (const q of onRoute) if (!inPlan.has(q.s)) dot([q.s.lat, q.s.lon], colorOf(q.s), 6).bindPopup(`${esc(q.s.name)} · mile ${q.along.toFixed(0)}`).addTo(layer);
  dot([A[0], A[1]], '#0b3d91').bindPopup('A: ' + esc(A[2])).addTo(layer); dot([B[0], B[1]], '#0b3d91').bindPopup('B: ' + esc(B[2])).addTo(layer);
  p.stops.forEach((s, i) => dot([s.s.lat, s.s.lon], colorOf(s.s), 11, s.kind === 'manual' ? '#111' : '#fff').bindPopup(`Stop ${i + 1}: ${esc(s.s.name)}`).addTo(layer));
  renderLegend(pk);
  if (fit) { m.invalidateSize(); m.fitBounds(line.getBounds(), { padding: [20, 20] }); }
  // output
  const pts: [number, number][] = [[A[0], A[1]], ...p.stops.map(s => [s.s.lat, s.s.lon] as [number, number]), [B[0], B[1]]];
  const legs = gmapsLegs(pts);
  const g = (x: number) => `${Math.max(0, x).toFixed(1)} gal`, pc = (x: number) => `${x.toFixed(0)}%`;
  const lastMi = total - (p.stops.at(-1)?.along ?? 0) + (p.stops.at(-1)?.detourMi ?? 0);
  const tag = (s: Station) => { const b = brandOf(s.key); return `<span class="tag" style="--c:${b?.color ?? FALLBACK_COLOR}">${esc(b?.label.replace('-owned stations', '') ?? 'FALLBACK').toUpperCase()}</span>${s.members ? '<span class="tag" style="--c:#475569">MEMBERS ONLY</span>' : ''}`; };
  $('out').innerHTML =
    `<h2>${p.totalMi.toFixed(0)} mi · ${(dur / 3600).toFixed(1)} h · ${p.stops.length} stop${p.stops.length === 1 ? '' : 's'}</h2>` +
    p.warnings.map(w => `<div class="warn">⚠️ ${esc(w)}</div>`).join('') +
    `<div class="stop"><b>A</b> ${esc(A[2])}<br><small>Leave with ${pc(start)} (${g(tank * start / 100)}) · ${esc(car.name)}</small></div>` +
    p.stops.map((s, i) => `<div class="stop ${s.kind}" data-kind="${s.kind}" data-key="${s.s.key}" style="--c:${colorOf(s.s)}"><b>Stop ${i + 1}</b> ${esc(s.s.name)}${s.s.brand && s.s.brand !== s.s.name ? ' (' + esc(s.s.brand) + ')' : ''}${tag(s.s)}${s.kind === 'manual' ? '<span class="tag" style="--c:#111">MANUAL</span>' : ''}${s.topoff ? '<span class="tag top">TOP OFF · optional</span>' : ''}<br>
      <small>${s.milesFromPrev.toFixed(0)} mi from previous · mile ${s.along.toFixed(0)} · arrive with ${pc(s.arrivePct)} (${g(s.arriveGal)}) · ${s.topoff ? 'top off' : 'fill up'}</small>${s.warn ? `<div class="warn">⚠️ ${esc(s.warn)}</div>` : ''}</div>`).join('') +
    `<div class="stop"><b>B</b> ${esc(B[2])}<br><small>${lastMi.toFixed(0)} mi from previous · arrive with ${pc(p.arrivePct)} (${g(p.arriveGal)})</small></div>` +
    legs.map((u, i) => `<a class="leg" target="_blank" rel="noopener" href="${u}">Open leg ${i + 1} in Google Maps</a>`).join('') +
    `<div class="salist"><b>Preferred stations on route (${onRoute.length})</b>${listed.length < onRoute.length || showAll ? ` <button type="button" class="sec" id="showall">${showAll ? `Hide detours over ${CONFIG.listMaxMin} min` : `Show all ${onRoute.length}`}</button><br><small>${showAll ? '' : `Showing ${listed.length} with ≤${CONFIG.listMaxMin} min round-trip detour.`}</small>` : ''}${listed.length ? '<ul class="rs">' + listed.map((q, i) => {
      const isMan = manual.has(q.s);
      return `<li><i class="dot" style="background:${colorOf(q.s)}"></i><div>${esc(q.s.name)} ${tag(q.s)}<br><small>mile ${q.along.toFixed(0)} · ${detMi(q) ? `detour ≈${detMi(q).toFixed(1)} mi each way (~${detMin(q).toFixed(0)} min)` : 'on route'}${inPlan.has(q.s) && !isMan ? ' · in plan' : ''}</small></div><button type="button" data-rs="${i}" class="${isMan ? 'rm' : ''}">${isMan ? 'Remove' : 'Add as stop'}</button></li>`;
    }).join('') + '</ul>' : '<br><small>None of your preferred brands within the corridor or short-detour radius.</small>'}</div>`;
  $('out').querySelectorAll<HTMLButtonElement>('button[data-rs]').forEach(b => b.onclick = () => {
    const s = listed[+b.dataset.rs!].s; manual.has(s) ? manual.delete(s) : manual.add(s); replan();
  });
  const sa = document.getElementById('showall'); if (sa) sa.onclick = () => { showAll = !showAll; replan(); };
}
inp('start').onchange = inp('reserve').onchange = () => replan();

// ---- service worker (not on file://, not in dev) ----
if ('serviceWorker' in navigator && location.protocol !== 'file:' && import.meta.env.PROD) {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js');
}
