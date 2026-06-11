# Handover — 2026-06-10 late session (mobile station)

Everything is committed and pushed. **Code is launch-ready but NOT yet deployed
to prod** — that's the first action below. Outreach batch 2 fires tomorrow
(Thu) 7–9am from homebase regardless of anything in this doc.

## 1. DEPLOY (do this on homebase before/at the 7am batch if possible)

```bash
git pull                              # master tip (palette + fixes + screen fix)
npx serverless deploy --stage prod    # backend FIRST: new photo route + bucket CORS
npm run deploy:prod                   # client → S3 + CloudFront invalidation
```

If you already deployed the client once tonight, deploy it AGAIN after this
pull — a late fix bumped the busters to `?v=20260611b` / SW `v21`.

Backend first: the pushed client expects `GET /api/estimates/{id}/photos` and
the S3 CORS rules that only exist after the backend deploy. Until both run,
prod still has the old theme and the broken photo/custom-item/approval bugs.

## 2. What changed tonight (master `c15a6fb`)

**Rebrand** — "Evergreen & Cedar" palette replaces the Anthropic-style
terracotta everywhere (app light+dark, landing, legal pages, emails, widget
default). Map/canvas drawing colors use cedar `#a05a2c` (visibility over grass);
bright sketch colors untouched. NOTE: existing companies keep their stored
terracotta `accentColor` in DynamoDB — only new signups get evergreen
(migration script is a 10-minute task if wanted).

**Fixes (all were live-prod bugs, confirmed by adversarial review):**
- Photo pipeline was 100% broken three ways: presigned PUT signed a fixed 10MB
  Content-Length (every upload failed), bucket had no CORS (preflight rejected),
  and display used raw S3 URLs on a public-access-blocked bucket. Fixed:
  unsigned length, CORS rules in serverless.yml, presigned-GET display flow.
- Custom line items were dead (unquoted UUIDs in inline handlers).
- approve.html rendered addons as "0","1" (expects array shape now; legacy ok).
- Stripe webhook: idempotency is an atomic claim released on failure (events
  were being permanently dropped on transient errors); TTL attr fixed
  (`expiresAt`, was `ttl` = never expired).
- Checkout: customer create/attach is single-winner (double-click created
  duplicate Stripe customers → paid-but-free-tier).
- Starter-cap bypass closed: server ignores client-supplied
  `source:'website-widget'`; undo-delete now uses the restore endpoint.
- Saved totals/footage read numeric state (`computedTotals`), not
  locale-formatted DOM ($1.234,56 → $1.23 corruption; metric saved m as ft).
- API client no longer retries POSTs (duplicate leads on flaky networks).
- Mid-width screens (901–1450px CSS, e.g. 1080p at 125–150% display scaling):
  the map toolbar's intrinsic width pushed the estimate panel off-screen
  (`min-width:auto` flexbox trap). Fixed with `min-width:0` on `.map-panel`;
  regression-tested at 1280x648/1536x816 + panel-on-screen assertions.

Cache busters: `?v=20260611b`, service worker `fencetrace-v21`. Tests: **1572
passing, 59/59 suites**. `client/dist` synced with preview.

## 3. Review backlog (confirmed findings NOT yet fixed — wave 3)

Full multi-agent review ran tonight: 99 findings, ~65 confirmed. Fixed the
criticals above. Highest-value remaining, roughly in order:

1. **Market rollup aggregates nothing** — `deriveMarketFields` expects
   `[lat,lng]` arrays, clients send `{lat,lng}` objects → regionKey never set,
   the "data moat" is empty (`handlers/estimates.js:324`). Fix + backfill.
2. **Team invites only work for never-registered emails** (redemption lives
   solely in Cognito PostConfirmation; existing accounts can't join,
   `handlers/auth.js:24`).
3. **Editing the member role is a silent no-op** (writes
   `defaultMemberPermissions`, nothing reads it; `handlers/roles.js:127`).
4. **Lambda bundles include `outreach/`** — Gmail OAuth token + CRM ship inside
   every deployed function zip (serverless.yml packaging). Exclude it.
5. Outreach agent: sends before it scans (overnight opt-out gets one more
   email) and saves crm.json after the Gmail send (crash window = double-send);
   opt-outs from a different reply address are missed (`outreach/manage.js`).
6. `STRIPE_WEBHOOK_SECRET` SSM default is `''` → fail-open if param missing;
   checkout accepts arbitrary client tier; dispute handler reads
   `data.customer` which doesn't exist on Dispute objects (`webhook.js`).
7. daily-digest widget-lead exclusion is dead code (doesn't project `source`);
   approval share tokens never expire; prod table/pool have no
   DeletionPolicy + PITR off; `deploy:prod` has no preview→dist build step
   (tonight it was synced manually — keep doing that or add a copy script).

## 4. Pending on Todd (business)

1. **Deploy** (section 1).
2. **DKIM**: `aws route53 change-resource-record-sets --hosted-zone-id Z034210220UJFLSY9V2RP --change-batch file://outreach/dkim-records.json`
   then poll `aws sesv2 get-email-identity --email-identity fencetrace.com --region us-east-1 --query DkimAttributes.Status --output text` until SUCCESS.
3. **Bank**: add "DBA FenceTrace" to the LLC account (cert PDF in SCC CIS).
4. **Confirm footer address** (8115 Judith Ln Unit 2008, Mechanicsville)
   receives mail; else swap to Stephens Manor in `outreach/build-body.js`.
5. **Hanover County**: register with the Commissioner of the Revenue (no fee,
   no BPOL for software) and call Planning & Zoning re: home business
   (804-365-6171). Asset inventory + filing helper live on the MOBILE STATION
   at `C:\Users\porte\Documents\RavenWing\assets\` (`node report.js`); business
   property return due May 1 yearly, received not postmarked. RW-0001
   (homebase) still needs make/serial/cost captured — command in its README.
6. Trademark: nothing due; check TSDR ~Sep 2026.

## 5. Machines (does NOT transfer via git)

- **Homebase** (upstairs, always-on, RTX 5070 Ti): runs the outreach agent
  scheduled task (hourly 7am–2pm + 7:30pm), has AWS creds, Gmail OAuth files,
  ANTHROPIC_API_KEY. NEVER create the agent task on a second machine
  (double-sends). Deploys happen here.
- **Mobile station** (ROG Ally X): dev/test only — no AWS creds, no agent.
  Holds the asset inventory (above); copy it to homebase or commit somewhere
  private if you want it backed up.
- Outreach state (`outreach/crm.json`) IS committed and transfers fine.
  Batch 1 of 5 sent 2026-06-10 6:33pm; 15 prospects remain, 5/day Tue–Thu.
- Dev Stripe still points at the old $4.99 test price (cosmetic, dev only).
- `/standup` in Claude Code = morning brief.
