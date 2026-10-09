# Project Progress — WA Stay

_Last updated: 2026-10-09 (orchestrator)_

## Phase
Phase 4 — Execution loop. Planning is complete: 7 master plans and 30 task specs, approved by the stakeholder on 2026-10-02.

## Currently in flight
- **U1** (#35) Watches provider-first: design phase (L task), lane M; reuses E1's catalogue hooks and cards; E1 merged; implementation after design approval.
- Next (two agents at a time): then P7, U3, U5, U2, U4; E2/E3 (E1 merged); Q2 last.

## Notes
- 2026-10-09: the stakeholder resumed. V4 and E1 rebased onto `47ceaf1` (`a14dfe3`, `16bc8c4`; wip backups updated); V4 and E1 reviews running in parallel (two agents at a time to pace quota).
- 2026-10-04 11:45 UTC: the stakeholder paused new agent work to save quota. Running agents finish their current step; no reviews, merges or new dispatches until the stakeholder resumes. Next on resume: review V4 → merge → V6 phase 2 → review V6; review E1 (merge needs a rebase onto V4/V6 changes); then P7, U1, U3, U5, E2, E3, U2, U4, Q1 phase 2 review, Q2. All work is committed on lanes; nothing is running. Unmerged lanes are backed up on GitHub (stakeholder-approved): `wip/v4-core-scheduler` (lane/w, `41001c1`), `wip/v6-accounts-phase1` (lane/a, `037468f`), `wip/e1-explore` (lane/r, `8405824`). On a fresh container: `git fetch origin wip/...` and recreate the lanes from them. Delete each wip branch once its work is merged.
- 2026-10-04: V4's live sanity run placed a real anonymous hold (#2072968, Bungarra site 02, 3–5 Nov 2026; lapsed unpaid 12:04 UTC). New hard rule §12.33: no live holds in any run; added to both agent contracts.
- 2026-10-04 ~10:30 UTC: an account usage limit stopped all agents; resumed at 10:55 from their saved lanes (pre-rebase work pinned as `backup/e1-pre-rebase` and `backup/v4-pre-rebase`, local only).

## Completed
- **E1** (#32) Explore screen: review REQUEST_CHANGES (flaky camera-URL tests; list narrowed to the old area during a fit; stock map outranked our pins; design critique). Fixed in `b06e97a` + `54fa8bf`: only user moves write `map=`; results narrow only after the user moves the map; POIs/shields/airports hidden, faint sand roads, filled ink pins with white ring; popup styled with app tokens; focus returns to the card; new `Chip` primitive and Button `pill`/`floating`/`inverse` variants (no `!` overrides); softer selected card; default order by distance from map centre (A–Z with number-led names last without a map); "169 places" until the map moves; https-only card photos. Orchestrator rebase onto V4/V6 (shell test conflict resolved), gate green (2583), before/after screenshots checked. Security/politeness confirmed by the reviewer (token build-time only, 1 ParkStay call per session, 0 IPC on pan). Q1 phase-2 Explore journey included. Merged. Follow-ups for E2: replace NotFound at `/places/:providerId/:externalId`; the preview shows only the "PS" monogram, so also show the provider name (§12.9); back/forward that only changes `map=`; lazy 1.9 MB mapbox chunk. Backup `wip/e1-explore` can be deleted on GitHub.
- **V6** (#24) Provider accounts, in-app sign-in and payment: review REQUEST_CHANGES (a window whose first load was blocked or hung never showed; the DBCA queue bounced sign-in/payment to the search page). Fixed in `06f9221`: windows always show or close with `PROVIDER_ERROR`; a window back from the waiting room reloads its target once; `openPayment` runs the access gate first (≤ 60 s); ParkStay payment also needs `PB<ref>` on the page (find-in-page, no script); v9 under `secure_delete` with a VACUUM retry task; `done` set after commit; `unknown` cached 5 s. Gate green (2401); live Electron suite 3/3 files (orchestrator re-ran). Security confirmed by the reviewer: hardening, matcher attacks blocked, no secrets in logs, ciphertext gone after v1→v9. ParkStay `account: optional` (§12.32); PQ1: ParkStay emails a code. Merged. Stakeholder checklist items: real sign-in (code), sign-in surviving a restart, sign-in and payment while the queue is active, anonymous hold → sign in inside payment → basket kept → BOOKED (genuine intent only). Backup `wip/v6-accounts-phase1` can be deleted on GitHub.
- **V4** (#22) Core services and scheduler: review REQUEST_CHANGES (generation-unscoped attempts could leave a re-armed snipe not polling; an in-flight night-guard conflict killed the other snipe). Fixed in `cc10ea6` with 9 race tests that fail on the old code; the reviewer's 15 adversarial tests pass; gate green (2268). Also: no timers after stop(), unlock keeps runs and gate holds, hold notified for a deleted snipe, catalogue sync waits only for non-cancellation QUEUEING/WAITING_RELEASE/SNIPING snipes. node-cron removed. Merged. The `wip/v4-core-scheduler` backup could not be deleted (the git proxy refuses branch deletes); the stakeholder can delete it on GitHub.
- **V5** (#23) Location catalogue service: review APPROVE (all 13 criteria met; ~70-input FTS5 fuzz with no throws; FTS integrity checked; perf 34–53 ms; quit mid-sync leaves no write). Merged (`9010679`). Accepted risk: the first cold detail per session re-fetches ParkStay's campground_map (~64 KB gzip), tracked for E2. Follow-up merged (`fe52f9b`): sweep covers `catalog:availability`/`check-location` (coverage guard widened; `accounts:status` pending for V6), 60 s cache for access-gate/timeout errors, empty-catalogue retries at 1/2/5 min, future timestamps count as stale.
- **V3** (#21) ParkStay provider module: review APPROVE; merged. Follow-up merged (`c649534`): the gate reports `idle` when unheld, a negative cache for a missing release time, a warning on an empty bulk response. Known, deliberately left: `toofar` labelling of nights past the horizon; the unit id for class-listed campgrounds is one free site id (watches filter locally by id or name since V4). Migrated daily-rollover `releaseAt` recompute is in V4.
- **B3** (#28) Legacy install migration: review REQUEST_CHANGES (a stale `in-progress` marker could delete a live `wa-stay.db`). Fixed: stale markers cleared on fresh-install/declined, the redo moves `wa-stay.db` aside and never deletes it, target-folder errors name the WA Stay folder, the welcome notice and login-item replacement are retried until done, the staging folder is swept. Orchestrator added a guard so the final rename never replaces a `wa-stay.db` that appears mid-copy (+ test). 12/12 adversarial scenarios, 31 kill points; gate green after rebase on V3 (2099 tests). Merged. Manual Windows checklist (BQ3/BQ4) stays with the stakeholder.
- **Q1** (#40) phase 1: Electron smoke E2E harness, test env hooks (gated `!isPackaged`), network-free fixture mode, 10 journeys, CI e2e job. Also fixed a D3 route-focus race. Merged after an orchestrator rebase and checks (gating reviewed; e2e 10/10 locally). Phase 2 (Explore and create-watch journeys) is handed to E1/U1; the full independent review happens then.
- **V2** (#20) Data model v8: APPROVE after an adversarial migration review (every row and column matched on v5/v6 plus edge data). Orchestrator rebase onto B2: notifications carry the real provider and location, orphan adoption keeps `updated_at`. Merged.
- **B2** (#27) App identity rename: review REQUEST_CHANGES (the installer snapshot didn't close the running v1 exe; dead finish page). Fixed: legacy app closed before the snapshot, standard finish page, small email logo. Merged.
- **P6** (#17) Sandboxed preload: APPROVE (the reviewer re-verified V1 namespaces in the sandboxed built and packaged app), merged.
- **P5** (#16) SecretVault: APPROVE. Durability fixes: read-back verification before the legacy copy is replaced, fsync before rename, `conf` pinned. Merged.
- **V7** (#25) Browser automation: review REQUEST_CHANGES (Playwright launched Edge/Chrome with Chromium's sandbox off). Fixed: `chromiumSandbox: true`, quit hold hides windows, safe kill, docs for search-mode providers. Merged after resolving P5 overlaps.
- **V1** (#19) Provider SDK and contract: review REQUEST_CHANGES (Electron transport couldn't see redirects in production). Fixed on `net.request` with 21/21 live Electron tests (`npm run test:electron`). Registry flag rules, two-way schema/type assertions and extensibility hooks (§12.30). Merged.
- **D3** (#31) App shell: review REQUEST_CHANGES (emoji bell, heading ring, brushstroke width), fixed. TODO(V1) shim swapped for the real types; window minimum 960×640 moved into main-window.ts. Merged.
- **P4** (#15) Main-process hardening: reviewed (APPROVE; the reviewer independently re-ran 27/27 runtime checks). Fixed: SMTP password not reused across host/user changes, queue key masked in logs, recursive log redaction, flaky OAuth test. Merged.
- **D2** (#30) UI component library: review REQUEST_CHANGES (toasts inert under modals, plus minors), fixed (toasts portalled outside `#root`, persistent live region, focus-trap robustness, calendar band), merged.
- **P3** (#14) Composition root and typed IPC: reviewed (APPROVE; verified with a real untrusted window), small follow-ups fixed by the orchestrator, merged. Logout no longer deletes the profile (§12.22).
- **B1** (#26) Brand assets: the stakeholder chose the "Roofline sunset" logo. Review found a Windows CRLF CI failure (pre-existing in a D1 test); fixed with `.gitattributes` `eol=lf` plus CRLF-tolerant tests. Optical centring fixed, merged.
- **P2** (#13) Database foundation: reviewed (APPROVE; minors fixed in a fix commit, which adds the FK baseline rule, full-row upgrade assertions and an FK-off guard), merged. The v6 delivery-log FK bug is reproduced and fixed by v7.
- **D1** (#29) Design language and tokens: reviewed (APPROVE + minors fixed in a fix commit; palette anchors re-sampled from the stakeholder reference: ocean #3A74B8, sun #E8B858, coral #D05830), merged.
- **P1** (#12) Test infrastructure: reviewed (APPROVE, 1 minor + 3 nits fixed by the orchestrator, plus the CSS stub mock), merged.
- Board: 30 `ai-planning` issues filed, #12–#41 (mapping in streams.md).
- Kickoff: technical, UI and ParkStay API reviews (`ai-state/research/`).
- Brief, streams, architecture notes (§1–§12 amendments), 7 master plans, 30 task specs.
- Dependencies installed: playwright-core 1.56.1, sanitize-html 2.17, mapbox-gl, lucide-react, Figtree and Fraunces.

## Next to dispatch
- After P4: P5 (SecretVault) and P6 (sandboxed preload) in parallel.
- After V1: V2, V3 and V7; D3 (once D2 is merged).
- Lane M: P2 (after P1 merges) → P3 → {P4, P5, P6} → V1 → …
- Lane R: D2 (after D1 merges) → D3 (needs V1) → …
- Lane A: B1 (after D1 merges).

## Notes
- Spec files in `ai-state/streams/*/tasks/` are canonical. Orchestrator addenda are added there, and issue bodies are synced at the end.

## Active blockers
- None. Stakeholder actions pending (non-blocking): add the `MAPBOX_ACCESS_TOKEN` Actions secret; rename the repo before releasing v2.0.0; confirm ParkStay sign-in (PQ1/PQ2) during V6 verification.

## Proposed GitHub repo description (stakeholder to paste)
> WA Stay — find and book places to stay across Western Australia. Map-first discovery, availability watches and instant site holds across providers, starting with ParkStay WA. Electron desktop app.
