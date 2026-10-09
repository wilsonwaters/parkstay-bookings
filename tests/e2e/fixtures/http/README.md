# Provider HTTP fixtures (Electron smoke tests)

In fixture mode (`WA_STAY_E2E_FIXTURES_DIR`, set by the harness to this folder) no provider
request reaches the network. Each provider's `HttpClient` is a `FixtureHttpClient`
(`src/main/testing/fixture-http-client.ts`) that answers from the files here. Fixture mode is
test-only: a packaged app never enters it.

## Layout

One folder per provider id, each with a `manifest.json` and the response files it names:

```
http/
└── parkstay/
    ├── manifest.json
    ├── campground_map.json      # the catalogue the app syncs 5 s after launch (V5), Explore's places (E1)
    ├── campsite_availablity_view_20.json  # Bungarra's sites and description, for its detail page (E2)
    └── profile-signed-out.json  # /api/profile signed out (403), the account check at launch (V6)
```

A provider with no folder, or no routes, answers every request with an error.

## Manifest

```json
{
  "routes": [
    { "method": "GET", "path": "/api/campground_map/", "file": "campground_map.json" },
    {
      "method": "GET",
      "path": "/api/campground_availabilty_view/",
      "query": { "gear_type": "all" },
      "file": "availability.json"
    },
    { "method": "GET", "path": "/queue", "status": 200, "file": "queue.html", "contentType": "text/html" }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `method` | `GET`, `HEAD`, `POST`, `PUT`, `PATCH` or `DELETE`. |
| `path` | The URL path, exactly, trailing slash included. The host is not compared. |
| `query` | Optional. Every parameter listed must have exactly this value; parameters not listed may have any value. Without `query`, any query string matches. |
| `status` | Optional, default 200. |
| `file` | The response body, relative to the provider's folder. |
| `contentType` | Optional. Defaults from the extension: `.json` → `application/json`, `.html` → `text/html`, anything else → `text/plain`. |

The first matching route wins, so put specific routes (with `query`) before general ones.

A request that no route matches is not sent. It fails with `no fixture for GET <url>; add a
route to <manifest>`, and is appended to `<userData>/e2e-unexpected-requests.log`. A failed
test attaches that log as `unexpected-requests`, which lists exactly the routes to add.

## Provenance and rules

- Only responses from providers' **public** endpoints, recorded without signing in. Never a
  cookie, token, booking, email address or other personal detail.
- Trim each response to the smallest set the journeys need (for ParkStay's catalogue, 8
  campgrounds covering `campground_type` 0, 1, 2 and 4, at least 3 regions, with images and
  features), so a fixture stays readable in review.
- Test data only. Nothing under `tests/` is packaged (`electron-builder.json` ships `dist/`),
  and the app always fetches ParkStay data and images live at runtime (brief O8). Image URLs in
  a fixture are never loaded: the network guard cancels them, and the app shows its fallback.
- **ParkStay** (`parkstay/`): the catalogue, because the app syncs it 5 s after the window is
  up (V5). `campground_map.json` answers `GET /api/campground_map/` with the trimmed public
  sample probed on 2026-10-02 (`ai-state/research/parkstay-api-review.md`): the 6 campgrounds
  the Jest suite uses (`tests/fixtures/parkstay/`, unchanged and first) plus 5 more for the
  Explore journey (E1), 11 in all. They cover `campground_type` 0 (5), 1 (2), 2 (3) and 4 (1)
  across 8 regions (Pilbara, Kimberley, South Coast, Goldfields, Midwest, South West, Swan,
  Warren), each with its images and features, and at most 3 campsites.

## Refreshing a fixture

When a provider's response format changes, the journey that uses it fails at the parse step
and names the route. To refresh:

1. Fetch the endpoint once, politely: a browser user agent, the provider's own `Referer` (for
   ParkStay `https://parkstay.dbca.wa.gov.au/`), and one request, not a crawl.
2. Trim it as above, keeping the same ids where the specs rely on them.
3. Save it over the old file, update `manifest.json` if the path or query changed, and note
   the date here.
4. Run `npm run build:e2e && xvfb-run -a npm run test:e2e`, and the provider's Jest tests.
