# Project Progress — WA Stay

_Last updated: 2026-10-04 (orchestrator)_

## Phase
Phase 4 — Execution loop. Planning is complete: 7 master plans and 30 task specs, approved by the stakeholder on 2026-10-02.

## Currently in flight
- **V3** (#21) ParkStay provider module: MERGED (review APPROVE; 177 suites / 2009 tests, test:electron 26/26). Follow-up fix in lane X: gate reports `idle` when unheld (chip stuck on "Expired"), negative cache for missing release time, warn on empty bulk response. Known, deliberately left: `toofar` labelling of nights past the horizon; unit id for class-listed campgrounds is one free site id (may drift between polls; revisit after V5). Migrated daily-rollover `releaseAt` recompute moved to V4.
- **V5** (#23) Location catalogue service: lane Y (`/home/user/wt/lane-y`, branched from lane/x).
- **E1** (#32) Explore screen: lane R.
- **V4** (#22) Core services and scheduler: design phase (L task), lane W.
- Next: V6 design starts once the V4 design is approved (it builds on `core/snipes` and `core/bookings`); then P7, U1, U3, U5 after V4; E2/E3 after E1 (E3 also after V5); U2/U4 after V6; Q2 last.

## Completed
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
