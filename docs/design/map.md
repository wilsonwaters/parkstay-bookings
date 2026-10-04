# WA Stay map

Explore's map (E1): Mapbox GL JS v3 on Mapbox's `outdoors-v12` style, recoloured at run time to the WA Stay palette, with the app's own clustered pins and name pills. The code is in `src/renderer/features/explore/map/`; the rules for colour and type are in [design-language.md](design-language.md).

| File | What |
| --- | --- |
| `mapboxController.ts` | The only module that imports `mapbox-gl` (and its CSS), by dynamic import. Implements `MapController` (`types.ts`). |
| `MapView.tsx` | The React side, lazy-loaded: creates one controller, syncs data, hover and selection, the preview, "Search as I move the map". |
| `waPalette.ts` | `applyWaPalette(map, tokens)`: the recolouring below, on every `style.load`. |
| `layers.ts` | `buildLayers(tokens)`, the source settings and the SDF pill image. Pure. |
| `geo.ts` | `toFeatureCollection`, `withinBbox`, `boundsOf`, `pillLabel`. Pure. |
| `mapboxToken.ts`, `webgl.ts`, `mapSupport.ts` | Whether the map can be shown at all. |

## Why outdoors-v12

- Most places are in national parks. Outdoors draws park boundaries, hillshade, contours and unsealed tracks, which matter for 2WD and 4WD trips.
- Recolouring land, water and parks gives the calm WA palette without an account-owned Studio style.
- Mapbox Standard was rejected: its basemap is an imported style that `setPaintProperty` cannot reach (it only has config properties), and it defaults to 3D and the globe. `light-v11` has no terrain or tracks.

## Recolouring

Colours come from the design tokens (`readMapTokens()` reads the `--ws-*` variables), never from hex in code. Every change is guarded by `map.getLayer(id)`: a layer Mapbox renames or drops is skipped and logged once in development, never an error.

| Layer (type) | Property | Value | Why |
| --- | --- | --- | --- |
| `land` (background) | `background-color` | `sand-50` | The page's canvas colour |
| `water` (fill) | `fill-color` | `ocean-100` | Pale Indian Ocean |
| `water-depth` (fill) | `fill-opacity` | 0 | Bathymetry darkens the sea at the zooms WA is seen at, hiding `ocean-100` |
| `water-shadow` (fill), `waterway-shadow` (line) | colour | `ocean-200` | Mapbox's deep-blue edge, softened |
| `waterway` (line) | `line-color` | `ocean-200` | Rivers and creeks |
| `landcover` (fill) | `fill-opacity` | 0.3 at z4, 0.25 at z8, 0 at z12 | Vegetation keeps its shapes at a third of Mapbox's strength, so its bright greens never outshout the pins |
| `national-park` (fill) | `fill-color`, `fill-opacity` | `eucalypt-50`, solid from z6 | Mapbox fades parks to 20%, which vanishes on sand |
| `national-park_tint-band` (line) | `line-color`, `line-opacity` | `eucalypt-600`, 0.3 | A soft edge, so park boundaries read at every zoom |
| `landuse` (fill) | `fill-color`, class `park` only | `eucalypt-50` | Every other class (school, hospital, …) keeps Mapbox's colour; the zoom interpolation is kept |
| `hillshade` (fill) | `fill-opacity` | 0.5 | Outdoors draws hillshade as a **fill** layer, not a raster with `hillshade-exaggeration`, so it is quietened with opacity: half strength, the equivalent of exaggeration 0.25 |
| `contour-line` (line), `contour-label` (symbol) | opacity | 0.3 | Terrain stays a hint |

### Verified layer list (2026-10-04)

`outdoors-v12` had 148 layers when E1 was built. The ones above, in the style's order: `land`, `landcover`, `national-park`, `national-park_tint-band`, `landuse`, `waterway-shadow`, `water-shadow`, `waterway`, `water`, `water-depth`, `hillshade`, `contour-line`, …, `contour-label`. The rest, by group: `pitch-outline`, `wetland`/`wetland-pattern`, `aeroway-*` (2), `building-*` (4), `land-structure-*` (2), `tunnel-*` (23), `cliff`, `ferry*` (3), `road-*` (35), `golf-*` (2), `turning-feature*` (2), `level-crossing`, `crosswalks`, `gate-*` (2), `bridge-*` (32), `aerialway`, `admin-*` (5), `block-number-label`, `path-pedestrian-label`, `natural-*` (2), `poi-label`, `transit-label`, `airport-label`, `settlement-*` (3), `state-label`, `country-label`, `continent-label`. Labels use `DIN Pro` with `Arial Unicode MS` fallbacks, which the app's own labels reuse (no extra font downloads).

To re-check after a Mapbox style update, fetch `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12?access_token=…` and compare the ids in the table; the development console names any that went missing.

## Camera and controls

- `projection: 'mercator'`, `dragRotate: false`, `pitchWithRotate: false`, `touchPitch: false`, touch rotation off, `renderWorldCopies: false`, `minZoom: 3`.
- First view: WA, `[[112.5, -35.6], [129.2, -13.5]]` with 32 px padding, unless the URL has `map=lng,lat,zoom`. The camera is written back to the URL (`replace`) 500 ms after the map stops.
- `NavigationControl` without the compass, top-right. The Mapbox logo and a compact `AttributionControl` bottom-left, clear of the tray (bottom-right). Both must stay visible (Mapbox terms).
- A new search (text or filters, not the map area) fits the map to its results, up to zoom 11. No results: the camera stays.

## Pins

| Layer | Look |
| --- | --- |
| `clusters` + `cluster-count` | White circle, ink 1.5 px ring, ink count (DIN Pro Medium 12). Radius 14, 18 from 10 places, 22 from 50. Clustered within 48 px up to zoom 10. |
| `location-dot` | White dot, ink 2 px ring, radius 5. Hovered or selected (feature state): ink, white ring, radius 8. Dots never collide, so every place stays visible. |
| `location-pill` | From zoom 8: the name, cut to 22 characters with "…", on a white SDF pill with an ink 1 px outline (`icon-text-fit: both`). Ink with white text while hovered or selected. Overlapping pills hide; their dots stay. |
| DOM marker | One ink pill (Figtree, `shadow-pill`) for the hovered or selected place, above everything, even inside a cluster. Decorative (`aria-hidden`): the card and the preview carry the name. |

Ink on white and white on ink are 17.79:1 (`fg`/`surface`, `fg-inverse`/`surface-inverse` in the contrast table).

The pill image is a signed distance field drawn in code (`pillImage()`): alpha 0.75 on the edge, falling 1/8 per pixel outwards at the image's pixel ratio, which is what Mapbox's SDF shader expects. That lets one image be recoloured and outlined per feature.

## Interactions

- Hovering or focusing a card highlights its pin (feature state and the DOM marker); hovering a pin highlights its card, without scrolling. The highlight lives in a small store outside React state, so only the two cards whose highlight changes re-render.
- Clicking a pin selects the place (`sel` in the URL), scrolls its card into view (`block: 'nearest'`) and opens a preview in a Mapbox popup: photo, full name, area, compact provider badge, "View details". Escape, its close button or a click on empty map closes it.
- Clicking a cluster eases to its expansion zoom. If its places share one spot (zooming cannot separate them), or several dots are under the pointer, a list of them opens instead.
- "Search as I move the map" (a `Switch`, on by default, `follow=0` when off) narrows the list to the visible area in the renderer: panning never calls IPC. Off, moving the map shows "Search this area", which narrows the list to the area at that moment.
- The visible area is the whole canvas (`map.unproject` of its corners), not `map.getBounds()`: Mapbox GL keeps the `padding` given to `fitBounds` as camera padding, and `getBounds()` leaves that margin out, so places fitted into the margin would drop out of "in map area".
- Below 1024 px one pane shows at a time, switched by the ink "Show map" / "Show list" pill, which moves focus to the revealed pane's heading. The map stays mounted (invisible, still sized) and is resized when shown, so it is never re-created and its camera is kept.

## When there is no map

Explore becomes a full-width list with an info notice when:

- the build has no token: "The map isn't available in this build, so places are shown as a list." Development builds add "Set MAPBOX_ACCESS_TOKEN in .env to enable it.";
- the computer has no WebGL: "This computer can't show the map, so places are shown as a list.";
- the map fails to load (a refused token, no network, a style error, 30 s without loading): "The map couldn't load, so places are shown as a list." with "Try again".

Nothing is requested from Mapbox in the first two cases: `mapbox-gl` is only imported when the map is created.

## Token

- `MAPBOX_ACCESS_TOKEN`, a **public** `pk.` token with public scopes only: it is bundled into the renderer, where anyone can read it. URL restrictions do not apply to `file://` (EQ5).
- `vite.config.ts` loads the repo-root `.env` explicitly (`loadEnv(mode, __dirname, '')`, since the Vite root is `src/renderer`) and takes `process.env.MAPBOX_ACCESS_TOKEN ?? .env ?? ''`, so CI's secret and `build:e2e`'s empty value win. It is exposed only as `define: { __MAPBOX_ACCESS_TOKEN__ }`, never through `envPrefix`. A secret `sk.` token fails the build.
- Local development: copy `.env.example` to `.env` (gitignored) and set the token. CI: the `MAPBOX_ACCESS_TOKEN` repository secret (or variable) is passed to the build steps in `build.yml` and `ci.yml`. The e2e build never has one.

## Content Security Policy

Allowed by `src/main/app/csp.ts` (P4): `connect-src https://api.mapbox.com https://*.tiles.mapbox.com https://events.mapbox.com`, `img-src … https:`, `worker-src blob:`, `child-src blob:`. Never block `events.mapbox.com`: Mapbox counts map loads there (terms).
