import 'leaflet/dist/leaflet.css';
import './style.css';
import L from 'leaflet';
import { CONFIG, DEFAULT_CAR } from './config';
import { project, plan, gmapsLegs, Station, detMi, detMin } from './plan';

type Car = { name: string; mpg: number; tank: number; reserve: number };
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ls = { get: <T>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || '') ?? d; } catch { return d; } }, set: (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v)) };
const status = (t: string) => ($('status').textContent = t);

// ---- cars ----
let cars: Car[] = ls.get('fr.cars', [DEFAULT_CAR]);
if (!cars.length) cars = [DEFAULT_CAR];
function renderCars(sel = ls.get('fr.car', 0)) {
  $<HTMLSelectElement>('car').innerHTML = cars.map((c, i) => `<option value="${i}">${esc(c.name)}</option>`).join('');
  $<HTMLSelectElement>('car').value = String(Math.min(sel, cars.length - 1)); fillCar();
}
function fillCar() {
  const c = cars[+$<HTMLSelectElement>('car').value]; if (!c) return;
  $<HTMLInputElement>('carname').value = c.name; $<HTMLInputElement>('mpg').value = String(c.mpg);
  $<HTMLInputElement>('tank').value = String(c.tank); $<HTMLInputElement>('reserve').value = String(c.reserve);
  ls.set('fr.car', +$<HTMLSelectElement>('car').value);
}
$('car').onchange = fillCar;
$('savecar').onclick = () => {
  const c: Car = { name: $<HTMLInputElement>('carname').value.trim() || 'My car', mpg: +$<HTMLInputElement>('mpg').value, tank: +$<HTMLInputElement>('tank').value, reserve: +$<HTMLInputElement>('reserve').value };
  const i = cars.findIndex(x => x.name === c.name); if (i >= 0) cars[i] = c; else cars.push(c);
  ls.set('fr.cars', cars); renderCars(i >= 0 ? i : cars.length - 1); status(`Saved car “${c.name}”.`);
};
$('delcar').onclick = () => { if (cars.length <= 1) return status('Keep at least one car.'); cars.splice(+$<HTMLSelectElement>('car').value, 1); ls.set('fr.cars', cars); renderCars(0); };
renderCars();

// ---- recent trips ----
function renderRecent() {
  const r: [string, string][] = ls.get('fr.recent', []);
  $('recent').innerHTML = r.length ? '<small>Recent:</small><br>' + r.map((t, i) => `<button type="button" data-i="${i}">${esc(t[0])} → ${esc(t[1])}</button>`).join('') : '';
  $('recent').querySelectorAll('button').forEach(b => (b as HTMLButtonElement).onclick = () => { const t = r[+b.dataset.i!]; $<HTMLInputElement>('a').value = t[0]; $<HTMLInputElement>('b').value = t[1]; });
}
renderRecent();
const topEl = $<HTMLInputElement>('topoff');
topEl.checked = ls.get('fr.topoff', true);
topEl.onchange = () => ls.set('fr.topoff', topEl.checked);

// ---- map ----
const map = L.map('map').setView([45.6, -120.5], 6);
L.tileLayer(CONFIG.tiles, { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
const layer = L.layerGroup().addTo(map);
const dot = (ll: L.LatLngExpression, color: string, r = 9) => L.circleMarker(ll, { radius: r, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 });

// ---- data ----
let stationsP: Promise<Station[]> | null = null;
const stations = () => stationsP ??= fetch(import.meta.env.BASE_URL + 'stations.json').then(r => r.json()).then(d => d.stations.map((s: any[]) => ({ lat: s[0], lon: s[1], name: s[2], brand: s[3], sa: !!s[4] })));
async function geocode(q: string): Promise<[number, number, string]> {
  const key = 'fr.geo.' + q.trim().toLowerCase(); const c = ls.get<[number, number, string] | null>(key, null); if (c) return c;
  const u = `${CONFIG.nominatim}?format=jsonv2&limit=1&countrycodes=us,ca&q=${encodeURIComponent(q)}`;
  const r = await fetch(u, { referrerPolicy: 'strict-origin-when-cross-origin' });
  if (!r.ok) throw new Error('Geocoder error ' + r.status);
  const j = await r.json(); if (!j[0]) throw new Error(`Couldn't find “${q}”`);
  const v: [number, number, string] = [+j[0].lat, +j[0].lon, j[0].display_name]; ls.set(key, v); return v;
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

$('f').onsubmit = async e => {
  e.preventDefault(); $<HTMLButtonElement>('go').disabled = true; $('out').innerHTML = '';
  try {
    const qa = $<HTMLInputElement>('a').value, qb = $<HTMLInputElement>('b').value;
    const mpg = +$<HTMLInputElement>('mpg').value, tank = +$<HTMLInputElement>('tank').value, start = +$<HTMLInputElement>('start').value, reserve = +$<HTMLInputElement>('reserve').value;
    status('Finding addresses…');
    const A = await geocode(qa); await sleep(1100); const B = await geocode(qb); // ≤1 req/s
    status('Routing…');
    const rr = await fetch(`${CONFIG.osrm}/${A[1]},${A[0]};${B[1]},${B[0]}?overview=full&geometries=geojson`);
    if (!rr.ok) throw new Error('Routing error ' + rr.status);
    const route = (await rr.json()).routes?.[0]; if (!route) throw new Error('No route found');
    const coords: number[][] = route.geometry.coordinates;
    const { cum, proj } = project(coords, await stations());
    const total = cum[cum.length - 1];
    const p = plan(total, proj, mpg, tank, start, reserve, { topoff: topEl.checked });
    const saOn = proj.filter(q => q.s.sa);
    const recent: [string, string][] = ls.get('fr.recent', []);
    ls.set('fr.recent', [[qa, qb], ...recent.filter(t => t[0] !== qa || t[1] !== qb)].slice(0, 6)); renderRecent();
    // map
    layer.clearLayers();
    const line = L.polyline(coords.map(c => [c[1], c[0]] as [number, number]), { color: '#0b3d91', weight: 4 }).addTo(layer);
    for (const q of saOn) dot([q.s.lat, q.s.lon], '#16a34a', 6).bindPopup(`Space Age · mile ${q.along.toFixed(0)}${detMi(q) ? ` · detour ≈${detMi(q).toFixed(1)} mi` : ' · on route'}`).addTo(layer);
    dot([A[0], A[1]], '#0b3d91').bindPopup('A: ' + esc(A[2])).addTo(layer); dot([B[0], B[1]], '#0b3d91').bindPopup('B: ' + esc(B[2])).addTo(layer);
    p.stops.forEach((s, i) => dot([s.s.lat, s.s.lon], s.kind === 'sa' ? '#16a34a' : '#ea580c', 11).bindPopup(`Stop ${i + 1}: ${esc(s.s.name)}`).addTo(layer));
    map.fitBounds(line.getBounds(), { padding: [20, 20] });
    // output
    const pts: [number, number][] = [[A[0], A[1]], ...p.stops.map(s => [s.s.lat, s.s.lon] as [number, number]), [B[0], B[1]]];
    const legs = gmapsLegs(pts);
    const g = (x: number) => `${Math.max(0, x).toFixed(1)} gal`, pc = (x: number) => `${x.toFixed(0)}%`;
    const lastMi = total - (p.stops.at(-1)?.along ?? 0) + (p.stops.at(-1)?.detourMi ?? 0);
    $('out').innerHTML =
      `<h2>${p.totalMi.toFixed(0)} mi · ${(route.duration / 3600).toFixed(1)} h · ${p.stops.length} stop${p.stops.length === 1 ? '' : 's'}</h2>` +
      p.warnings.map(w => `<div class="warn">⚠️ ${esc(w)}</div>`).join('') +
      `<div class="stop"><b>A</b> ${esc(A[2])}<br><small>Leave with ${pc(start)} (${g(tank * start / 100)})</small></div>` +
      p.stops.map((s, i) => `<div class="stop ${s.kind === 'sa' ? 'sa' : 'fb'}" data-kind="${s.kind}"><b>Stop ${i + 1}</b> ${esc(s.s.name)}${s.s.brand && s.s.brand !== s.s.name ? ' (' + esc(s.s.brand) + ')' : ''}<span class="tag ${s.kind === 'sa' ? 'sa' : 'fb'}">${s.kind === 'sa' ? 'SPACE AGE' : 'FALLBACK'}</span>${s.topoff ? '<span class="tag top">TOP OFF · optional</span>' : ''}<br>
        <small>${s.milesFromPrev.toFixed(0)} mi from previous · arrive with ${pc(s.arrivePct)} (${g(s.arriveGal)}) · ${s.topoff ? 'top off' : 'fill up'}</small>${s.warn ? `<div class="warn">⚠️ ${esc(s.warn)}</div>` : ''}</div>`).join('') +
      `<div class="stop"><b>B</b> ${esc(B[2])}<br><small>${lastMi.toFixed(0)} mi from previous · arrive with ${pc(p.arrivePct)} (${g(p.arriveGal)})</small></div>` +
      `<div class="salist"><b>Space Age on route (${saOn.length})</b>${saOn.length ? '<ul>' + saOn.map(q => `<li>${esc(q.s.name)} · mile ${q.along.toFixed(0)} · ${detMi(q) ? `detour ≈${detMi(q).toFixed(1)} mi each way (~${detMin(q).toFixed(0)} min)` : 'on route'}</li>`).join('') + '</ul>' : '<br><small>None within the corridor or short-detour radius.</small>'}</div>` +
      legs.map((u, i) => `<a class="leg" target="_blank" rel="noopener" href="${u}">Open leg ${i + 1} in Google Maps</a>`).join('');
    status('Done.');
  } catch (err) { status('⚠️ ' + (err as Error).message); }
  finally { $<HTMLButtonElement>('go').disabled = false; }
};
function esc(s: string) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); }

// ---- service worker (not on file://, not in dev) ----
if ('serviceWorker' in navigator && location.protocol !== 'file:' && import.meta.env.PROD) {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js');
}
