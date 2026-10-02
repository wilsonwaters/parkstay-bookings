# Site Sniper

Site Sniper automatically secures a high-demand WA ParkStay campsite **at the earliest
possible legal moment it becomes available**. It is the feature formerly (and inaccurately)
called "Skip The Queue" / "Beat the Crowd" — that older description talked about cancelling
and rebooking to extend a stay, which is not what this does.

Instead, Site Sniper prepares everything ahead of time and reacts the instant a target site
opens, placing a temporary hold on it so you can complete payment before anyone else takes it.

> **Site Sniper places a 30‑minute hold, not a paid booking.** Payment on ParkStay requires
> the DBCA ledger single‑sign‑on and the BPOINT gateway, which are (deliberately) left to you.
> When a hold is placed you get an immediate desktop + email notification with a link to
> finish payment within the hold window.

---

## How ParkStay releases high-demand sites

Research against DBCA's published rules and the open-source ParkStay backend
(`dbca-wa/parkstay_bs_v2`) shows **two** distinct release regimes, plus a cancellation
fallback. Site Sniper supports all three via the **release mode** setting.

### 1. Daily rollover (all standard, non-Ningaloo campgrounds)

The booking horizon is a rolling 180 days. Every day at **00:00 AWST**, one new arrival date
(today + 180 days) becomes bookable. There is **no queue** for standard campgrounds. Being
ready and booking the instant a date opens is legitimate — nothing in the terms prohibits
speed or preparation.

Site Sniper computes the exact release instant for your arrival date
(`arrivalDate − 180 days` at 00:00 AWST) and tight-polls availability across that moment.

### 2. Scheduled release (Ningaloo Coast high-demand trial)

Ningaloo Coast campgrounds (Cape Range NP, Nyinggulara NP, Warroora Coast) release in monthly
blocks at a fixed instant — currently **10:00 AWST on the first Tuesday of the month** — gated
by the DBCA `parkstayv2` virtual queue. (DBCA has said this time "will be reviewed and may
change", so the release instant is a configurable field, not hardcoded.)

**Important reality about the Ningaloo queue:** joining early gives you **no advantage**. DBCA
clears every pre‑10:00 queue position and re‑allocates positions at random at 10:00, by design,
to defeat queue‑camping. So Site Sniper does **not** pretend to game your queue position and
does **not** simulate fake user activity to defeat the 60‑second inactivity timeout while you
are away. What it does do, legitimately:

- Establish a genuine queue session at/after the release instant so you are in the random draw.
- Keep that session refreshed (the same poll the official web client makes) while it is active.
- Poll availability the moment you are through the queue and place a hold on the first matching
  target site.

For Ningaloo snipes, enable **Queue** on the snipe and set the release instant to the published
open time.

### 3. Cancellation watch

There is no waitlist on ParkStay; DBCA's own advice for a booked‑out campground is to keep
checking for cancellations. Availability is effectively real‑time — cancelled and abandoned
holds reappear immediately. In **cancellation** mode Site Sniper polls continuously (with a
politeness floor) for your target site to free up, and places a hold when it does.

---

## Creating a snipe

From the Site Sniper page, or programmatically from the renderer:

```typescript
const snipe = await window.api.siteSniper.create(userId, {
  name: 'Osprey Bay — September long weekend',
  campgroundId: '123',
  campgroundName: 'Osprey Bay',
  targetSiteIds: ['456', '457'], // optional; empty => any site in the campground
  siteType: 'tent',              // gear_type: tent | campervan | caravan | all
  arrivalDate: new Date('2026-09-25'),
  departureDate: new Date('2026-09-28'),
  numAdult: 2,
  numVehicle: 1,
  postcode: '6000',
  releaseMode: 'scheduled',      // daily_rollover | scheduled | cancellation
  releaseAt: new Date('2026-09-01T02:00:00Z'), // 10:00 AWST — required for 'scheduled'
  queueEnabled: true,            // pre-establish the DBCA queue session (Ningaloo)
  leadTimeSeconds: 120,          // warm up / join queue this long before release
  pollIntervalMs: 1500,          // tight-poll cadence during the snipe window
  windowDurationMs: 900000,      // keep trying for 15 minutes after release
  maxAttempts: 0,                // 0 = unlimited within the window
  notes: 'Shaded sites preferred',
});
```

### Fields

| Field | Meaning |
| --- | --- |
| `name` | Label for the snipe |
| `campgroundId` / `campgroundName` | Target campground (search via `window.api.parkstay.searchCampgrounds`) |
| `targetSiteIds` | Preferred site ids; empty means any available site |
| `siteType` | ParkStay `gear_type` filter |
| `arrivalDate` / `departureDate` | Desired stay (every night must be `open` to place a hold) |
| `numAdult` / `numConcession` / `numChild` / `numInfant` | Party composition |
| `numVehicle` | Vehicles (per‑site max enforced by ParkStay) |
| `postcode` | Sent with the booking form |
| `releaseMode` | `daily_rollover`, `scheduled`, or `cancellation` |
| `releaseAt` | Exact release instant (UTC). Required for `scheduled`; auto‑computed for `daily_rollover`; ignored for `cancellation` |
| `queueEnabled` | Establish and hold a DBCA queue session before booking (Ningaloo) |
| `leadTimeSeconds` | Warm‑up / queue‑join lead time before `releaseAt` |
| `pollIntervalMs` | Availability poll cadence during the snipe window |
| `windowDurationMs` | How long to keep sniping after release before giving up |
| `maxAttempts` | Cap on attempts (0 = unlimited within the window) |

### Managing snipes

```typescript
await window.api.siteSniper.list(userId);
await window.api.siteSniper.get(id);
await window.api.siteSniper.update(id, { pollIntervalMs: 1000 });
await window.api.siteSniper.activate(id);   // arm
await window.api.siteSniper.deactivate(id); // disarm
await window.api.siteSniper.execute(id);    // run one attempt now
await window.api.siteSniper.delete(id);

// Live status updates
window.api.on.snipeStatusUpdate((snipe) => { /* refresh UI */ });
```

---

## Snipe lifecycle

`armed → waiting_release → queueing → sniping → held → booked`
(with `failed` / `expired` / `disabled` as terminal/paused states)

1. **armed** — created and scheduled; a precise timer is set for the release instant.
2. **waiting_release** — the timer is counting down to `releaseAt − leadTimeSeconds`.
3. **queueing** — (if `queueEnabled`) establishing/holding the DBCA queue session.
4. **sniping** — at the release instant, tight‑polling availability every `pollIntervalMs`.
5. **held** — a matching site opened and a 30‑minute hold was placed. **You complete payment.**
6. **booked** — recorded once you confirm the booking.

Because the release instant needs sub‑second precision, the scheduler uses real timers
(`setTimeout`/`setInterval`, long‑timer‑safe), not minute‑granularity cron.

---

## Compliance — read this

Site Sniper is built to operate **within DBCA's written terms and the intent of the
high‑demand policy**. The DBCA terms contain no explicit anti‑automation clause, but they do
impose hard limits that this tool respects and that **you** must respect:

- **One account per person.** Use only your own single DBCA account.
- **One booking per night.** Never hold more than one booking for the same night. Site Sniper
  applies a best‑effort guard against overlapping holds, but you are responsible for this.
- **Genuine intent to camp.** Only snipe stays you actually intend to use. Speculative or
  no‑intent booking is exactly what the trial exists to stop.
- **Verifiable identity.** Bookings must be in your own name; identity is checked on arrival.
- **No booking for others, no transfer/resale.**

DBCA may, at its discretion, cancel bookings and bar users who breach the terms, and it has
said it will keep changing the process as it monitors behaviour. Site Sniper deliberately
stops at placing a hold on your own account for your own intended stay and leaves payment to
you — it is functionally a fast, prepared human, not a fleet of bots.

---

## Under the hood (for developers)

- **Availability**: `GET /api/campsite_availablity_view/{campgroundId}/` (public). Each day
  carries a status string; a night is bookable only when it is `open`. A browser `User-Agent`
  and a valid `Referer` are required (the backend blocks scripting UAs and rejects missing
  Referers) — both are set by `getParkstayApiHeaders()`.
- **Hold**: `POST /api/create_booking` — CSRF‑exempt, `application/x-www-form-urlencoded`,
  fields include `campground`, `campsite` (or `campsite_class`), `arrival`, `departure`, party
  counts, `num_vehicle`, `postcode`. Success returns `{ status: 'success', pk }` and a 30‑minute
  temporary reservation. The backend re‑validates availability atomically, so a lost race just
  returns an error and the snipe keeps trying within its window.
- **Queue**: the `sitequeuesession` cookie gates `/api/` paths. `QueueService` establishes and
  refreshes it via `GET {queue}/api/check-create-session/`.

Key modules:

| Module | Purpose |
| --- | --- |
| `src/main/services/sitesniper/sitesniper.service.ts` | Snipe CRUD + the `execute` attempt (poll → hold → notify) |
| `src/main/services/sitesniper/release-timing.ts` | Pure AWST release‑instant math (unit‑tested) |
| `src/main/scheduler/job-scheduler.ts` | Timer‑based precision scheduling of snipes |
| `src/main/services/parkstay/parkstay.service.ts` | `getSiteAvailabilityView`, `createBookingHold` |
| `src/main/services/queue/queue.service.ts` | DBCA queue session + keep‑alive |
| `src/main/database/repositories/site-sniper.repository.ts` | `site_snipes` persistence (migration v6) |

> **Status of the ParkStay integration.** The availability and queue endpoints are verified
> against the live system; `create_booking` and the exact response shapes are derived from the
> open‑source backend and should be confirmed with a live capture before relying on unattended
> booking. Treat the booking path as needing a real‑world smoke test.
