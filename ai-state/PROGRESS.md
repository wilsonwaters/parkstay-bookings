# Project Progress — WA Stay

_Last updated: 2026-10-02 (orchestrator)_

## Phase
Phase 4 — Execution loop. Planning is complete: 7 master plans and 30 task specs, approved by the stakeholder on 2026-10-02.

## Currently in flight
- **V1** (#19) Provider SDK: review REQUEST_CHANGES (the Electron transport can't see redirects in production; registry flag rules; extensibility hooks, §12.30). Fix agent running, lane V.
- **D3** (#31) App shell: review REQUEST_CHANGES (emoji bell, heading focus ring, brushstroke width). Fix agent running, lane R. Merges after V1, swapping its TODO(V1) shim for the real types; window minimum 960×640 goes into main-window.ts.
- **P5** (#16) SecretVault: lane M (vault wiring into the provider SDK once V1 merges).
- **P6** (#17) Sandboxed preload: lane P (`/home/user/wt/lane-p`).
- Sandbox runtime verification uses per-HOME NSS trust of the agent proxy CA (`scratchpad/sandbox-nss.sh`) plus `--proxy-server`. TLS verification is never disabled.

## Completed
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
