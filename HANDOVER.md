# Handover — 2026-06-11 (homebase)

Tests: **1635 passing, 60/60 suites.** Two prod deploys today; a third (manual
BOM compare) is committed on `feat/manual-bom-compare` and mid-pipeline (dev →
prod). Outreach batch 2 (Apex, P. Saylor, A&T Workman, Greenfield, Schmidt)
sent automatically 7:00am — 10/20 prospects contacted, remainder Tue–Thu next
week. Reply drafter is now grounded (see below) — review drafts in Gmail as
replies arrive.

## 1. Deploy notes (changed today!)

`serverless client deploy` PROMPTS for confirmation — the `npm run deploy:dev`
/ `deploy:prod` scripts **hang forever in non-interactive shells**. Use:

```bash
npx serverless client deploy --stage dev --no-confirm
npx serverless client deploy --stage prod --no-confirm && aws cloudfront create-invalidation --distribution-id E2Q8DG4LT7KL3 --paths "/*"
```

Backend: `npm run deploy:backend` / `deploy:backend:prod` (no prompt, fine as-is).
Cache buster is at `?v=20260611e`. preview→dist still has NO build step — every
client edit must be copied to `client/dist/` manually (config.js is the only
intentional diff). **NEVER edit these files with PowerShell Get-/Set-Content**
— PS 5.1 reads UTF-8 as cp1252 and mojibakes every em-dash (it corrupted
index.html twice on 2026-06-11; repaired + verified clean, do bumps via Node).

## 2. Shipped to prod today (master `a2dcd96`)

**Money-path integrity** (found by recon, confirmed by adversarial review —
these made the product disprove its own pitch in demos):
- Terrain multiplier (Slope/Rocky) was display-only once a fence was drawn —
  now multiplies fence materials in the BOM total and the PDF.
- The customer approved a **materials-only** total (labor+markup computed then
  discarded). Saved/shared `totalCost` is now the full customer price; PDF,
  approval page, and in-app panel agree. Fence/gate labor respects the fence
  module toggle (mulch-only quotes no longer bill fence labor).
- Customer PDF + approval page exposed raw per-item material costs (a customer
  could back out the spread). Stripped server-side (`getPublic` returns
  name/qty/unit/isHeader only) and customer PDF drops cost columns.
- Job minimum is a floor (price raised, bump → profit), not a warning.
- Approval integrity: responses snapshot amount+footage; money-field changes
  on sent/approved estimates reset approval to 'sent' + append `revised`.
- saveEstimate persists the real multi-section BOM with manual overrides,
  section notes, custom items; loadSavedEstimate restores them.
- Export My Data now includes the price book + region; pricebook cloud-save
  failures toast instead of `.catch(function(){})`.
- PDF: applies BOM overrides, includes gate labor, respects fence/mulch
  toggles, customer mode shows item/qty only.

**UI**: "Save Estimate" button added to the panel action group (Save was
nav-only; Send to Customer requires a saved estimate). **Legal**: privacy.html
fictional cookie table removed, Google tiles disclosed, Cognito-accurate
session/CSRF/password claims; landing cancellation answer = 90 days in visible
FAQ + JSON-LD. **Outreach**: REPLY_SYSTEM grounded with verified-true facts
only (no terrain/export/staleness claims until deployed); classifier gained
`objection_type` enum; follow-up deduped into `build-body.js` with opt-out P.S.
restored on both paths.

## 3. In flight: manual BOM compare (`feat/manual-bom-compare`)

Contractor-private worksheet in the Material Breakdown panel ("Compare with
your list"): enter your own materials, rows match against the computed BOM
with qty deltas. Invariants (reviewer-verified, test-pinned):
**compare-only** (never touches totalCost/PDF/share/market-rollup) and
**contractor-private** (getPublic whitelist omits it — regression test).
Backend `manualBom` field validated like customItems (≤50 items, name ≤200,
capped finite numbers). Autosave now also persists customItems (old gap).
Known nits (deliberate): greedy matcher should get an exact-pass-first
two-pass; no client-side input clamps (server rejects at save, same as
customItems); matcher behavior pinned in `tests/manual-bom-compare.test.js`.

## 4. Decisions pending on Todd (product/business)

1. **Market rollup**: nightly job aggregates contractor pricing while the EULA
   forbids users compiling pricing datasets ("data-moat" comment in the code is
   journalist bait). Decide: opt-in, opt-out, or pause the (currently
   write-only) pipeline — BEFORE publishing any "your data is never shared"
   FAQ/marketing copy. Marcus-panel flip worth considering: give the data back
   ("regional cedar +12% since your last update") to answer the stale-prices
   objection.
2. **Gated copy now unblocked** by today's fixes but unshipped: material-card
   caption + "from $X/ft", landing FAQ additions (data ownership, cedar-jumps,
   vendor-disappears), approval-page range display, tagline. Ship only with
   their mechanisms (corner-post BOM still missing for the "every post" claim).
3. Customer PDF shows per-line prices for **custom items** (charges, not
   costs) while the approval page hides them — judgment call, flag if wrong.
4. Panel additions worth scheduling: price-book staleness stamp + nudge,
   import/export buttons, founder face-on-site, "run your last five jobs
   through it" challenge in outreach, reference accounts.
5. DKIM / bank DBA / Hanover County / footer address — unchanged from
   yesterday's list (see git history of this file).

## 5. Backlog burn-down (2026-06-11 evening batch — committed, see git log)

FIXED: market-rollup point-shape bug ({lat,lng} now accepted) + benchmark
opt-out (company.benchmarkOptOut, Account checkbox, rollup exclusion, privacy
§6.5 plain-English disclosure); share-link 30-day expiry (sharedAt, expired
flag, respond 410, approve.html banner; re-share refreshes the window); Stripe
webhook fail-closed secret + dispute-via-charge + checkout tier whitelist;
outreach agent scan-before-send + claim-before-send (crash = skip, never
double-email) + thread-based reply detection (off-address opt-outs honored) +
classification saved before draft creation; wood corner/end post split
(cornerPostCost price-book key, per-section vertex counts plumbed through
calculateBOM opts); manual-BOM two-pass matcher; BOM overrides restored on
reopen (single-section estimates only — multi-section combined BOMs repeat
names, see code comment).

## 5b. Review backlog (still open)

1. Team invites only work for never-registered emails; member-role edit is a
   silent no-op (`handlers/auth.js:24`, `handlers/roles.js:127`).
2. daily-digest widget-lead exclusion dead code; prod table/pool lack
   DeletionPolicy + PITR; privacy.html boilerplate (§2.2, §11.1 categories)
   still needs a real legal pass.
3. Pre-split saved estimates: post-row qty/price edits don't restore on reopen
   (old '… posts' names don't match the new line/corner rows) and manual-BOM
   rows naming the old post label show unmatched. Graceful, low-impact.
4. Reply drafts are addressed to the original prospect address even when the
   reply came from a different one (human-reviewed in Drafts, so visible).
5. Multi-section BOM override restore unsupported (name collisions); needs
   section-scoped matching if it ever matters.

## 5c. Observability (homebase-local, separate repo)

Grafana + Loki + Prometheus + blackbox at `C:\Users\porte\observability`
(own git repo) — http://localhost:3000, login/setup/rebuild instructions in
its README. Dashboards: FenceTrace + Skullbash Lambda overviews (CloudWatch
in place via read-only `grafana-readonly` IAM user), site uptime/TLS probes,
outreach agent logs (promtail→Loki). Requires Docker Desktop running.

## 6. Machines (does NOT transfer via git)

- **Homebase** (always-on, RTX 5070 Ti): outreach agent scheduled task (hourly
  7am–2pm + 7:30pm ET), AWS creds, Gmail OAuth, ANTHROPIC_API_KEY. NEVER
  create the agent task on a second machine. Deploys happen here.
  NOTE: the agent runs `node outreach/manage.js agent` from this working tree —
  whatever branch is checked out is what runs at 7:30pm.
- **Mobile station** (ROG Ally X): dev/test only — no AWS creds, no agent.
- `outreach/crm.json` is committed and transfers; batches 1+2 sent (10/20),
  5/day Tue–Thu, one follow-up max after 5 quiet days.
- `/standup` in Claude Code = morning brief.
