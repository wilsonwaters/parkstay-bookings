# Open Questions

| # | Question | Blocks | Status |
|---|---|---|---|
| Q1 | Electron 28 is end-of-life. Upgrade to a current Electron (native rebuild of better-sqlite3, re-test auto-update) as a follow-up project? | nothing in this PR | Deferred, raise at handoff |
| Q2 | The repo rename to `wilsonwaters/wa-stay` must happen **before** the v2.0.0 release is published. v1.x installs follow GitHub's redirect from `parkstay-bookings`. Never recreate a repo named `parkstay-bookings`, or the redirect breaks. | release of v2.0.0 | Stakeholder action |
| Q3 | Repo description: there is no GitHub tool available to set it. Proposed text is in PROGRESS.md for the stakeholder to paste. | nothing | Stakeholder action |
| Q4 | `MAPBOX_ACCESS_TOKEN`: the stakeholder supplied a public token on 2026-10-02 and verified it works (styles and tiles return 200). It is stored only in the gitignored `.env` and the orchestrator scratchpad. The stakeholder is adding it as a GitHub Actions repository secret. The workflow should accept `secrets.MAPBOX_ACCESS_TOKEN \|\| vars.MAPBOX_ACCESS_TOKEN`. | — | Resolved |
