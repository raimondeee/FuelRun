# ⛽ FuelRun

Phone-first PWA that plans gas stops along a road trip, **Space Age stations first** (Pacific Northwest chain), falling back to any brand only when no Space Age is reachable within your reserve, even with a short detour.

**Live:** https://raimondeee.github.io/FuelRun/

## How it works
- **Inputs:** A, B, MPG, tank (gal), starting fuel %, reserve % (default 25). Cars and recent trips are saved in `localStorage`. A default car, *2022 Subaru Ascent (Base)* (19.3 gal, 27 MPG, 25 %), is pre-filled and editable.
- **Geocoding:** Nominatim, called only when you press *Plan trip* (no autocomplete), at most one request per second, cached in `localStorage`. The browser sends the page origin as Referer.
- **Routing:** the public OSRM demo server, called from the browser (CORS is open).
- **Stations:** `public/stations.json` is prebuilt from OpenStreetMap (`amenity=fuel` in WA, OR, ID and MT) by `scripts/build-stations.mjs`, plus manual fixes in `data/overrides.json`. A weekly GitHub Action refreshes it, so phones never call Overpass. Rows are `[lat, lon, name, brand, spaceAge]`.
- **Stop algorithm:** walk the route; when the remaining fuel can't reach B above the reserve, pick the station furthest along the route that is still reachable without going below the reserve, in this order:
  1. Space Age within 2 km of the route
  2. Space Age within a short detour (≤15 km)
  3. any-brand fallback on the route
  4. fallback with a detour

  Fill to full and repeat. Detours and fallbacks are flagged with warnings.
- **Safety buffer:** fuel use is planned on OSRM miles × 1.05, because Google often picks a slightly longer road and real MPG varies.
- **Top off at Space Age** (toggle, on by default, saved): this adds an optional stop at the furthest reachable Space Age when you'd arrive at B below 50% (detour up to about 15 minutes round trip), or when a Space Age is within about 5 minutes of detour. You get at most one top-off per Space Age cluster (10 km), and only if you'd arrive there at 90% or less. Every Space Age within the corridor or detour radius is shown on the map and in the *Space Age on route* list.
- **Output:** a stop list with miles between stops and fuel (% and gal) on arrival, a Leaflet map (green = Space Age, orange = fallback), and chained Google Maps directions links (≤3 waypoints each, `|` encoded as `%7C`, each link under 2,048 characters; each leg starts where the previous one ended). No Google API key is needed.
- **Offline:** the service worker uses a build-hashed cache and is network-first for `index.html`. It isn't registered on `file://`.

## Develop
```sh
npm ci
npm run stations   # optional: rebuild station data from Overpass
npm run dev
VITE_BASE=/FuelRun/ npm run build
```

## Tests
`npm test` runs the planner tests, including the McMinnville→Spokane regression.

## Fixing station data
Edit `data/overrides.json`:
- `add`: `[{lat, lon, name, brand, spaceAge:true}]`
- `remove`: `["node/123"]`
- `patch`: `{"way/456": {"brand": "Space Age"}}`

Better still, fix the tags in OpenStreetMap itself.

## Credits and terms
Map data, stations and geocoding are © OpenStreetMap contributors (ODbL). Routing is by OSRM (FOSSGIS demo server: non-commercial use, max 1 request/s). Follow the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/). Fuel estimates are approximate, so always watch your gauge.

## Enabling the weekly refresh
The workflow lives at `ci/refresh-stations.yml`. The token used for the first push didn't have GitHub's `workflow` scope, so it couldn't be committed under `.github/workflows/`. To turn it on, move it into place:

```sh
gh auth refresh -s workflow
git mv ci/refresh-stations.yml .github/workflows/
git commit -m "Enable weekly station refresh"
git push
```

Or copy it there through the GitHub web UI.
