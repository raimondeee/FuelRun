// Provider endpoints. Change here to switch providers (no other code changes needed).
export const CONFIG = {
  osrm: 'https://router.project-osrm.org/route/v1/driving',
  nominatim: 'https://nominatim.openstreetmap.org/search',
  tiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  onRouteKm: 2,        // station counts as "on route" within this distance
  detourKm: 15,        // max straight-line distance off route for a short detour
  detourFactor: 1.4,   // road miles ≈ straight-line × factor, each way
  minHopMi: 15,        // don't plan a stop closer than this to the previous one
};
export const DEFAULT_CAR = { name: '2022 Subaru Ascent (Base)', mpg: 27, tank: 19.3, reserve: 25 };
