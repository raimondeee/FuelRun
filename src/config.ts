// Provider endpoints. Change here to switch providers (no other code changes needed).
export const CONFIG = {
  osrm: 'https://router.project-osrm.org/route/v1/driving',
  nominatim: 'https://nominatim.openstreetmap.org/search',
  tiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  onRouteKm: 2,        // station counts as "on route" within this distance
  detourKm: 15,        // max straight-line distance off route for a short detour
  detourFactor: 1.4,   // road miles ≈ straight-line × factor, each way
  minHopMi: 15,       // don't plan a stop closer than this to the previous one
  distBuffer: 1.05,    // plan fuel for 5% more miles than OSRM reports (Google often picks a longer road; MPG varies)
  topOffBelowPct: 50,  // top off at a preferred brand if arrival at B / next stop would be below this
  topOffMaxMin: 5,     // ...or if a preferred-brand station is within this many minutes of detour (round trip)
  topOffLowMaxMin: 15, // max round-trip detour minutes for a low-fuel (<50%) top-off
  detourMph: 40,       // speed used to estimate detour minutes
  topOffMaxStartPct: 90, // only top off if you'd arrive at the station at or below this % (adds ≥10%)
  topOffMinBeforeMi: 30, // no top-off within this many miles of the next stop / B (pointless)
  listMaxMin: 15,      // route-station list: show stations up to this round-trip detour by default
  clusterKm: 10,       // preferred stations within this distance count as one cluster
};
export const DEFAULT_CAR = { name: '2022 Subaru Ascent (Base)', mpg: 27, tank: 19.3, reserve: 25 };
