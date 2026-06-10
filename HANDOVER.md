# Handover — 2026-06-10 session (machine switch)

Everything from today is committed and pushed. Detailed outreach runbook:
`outreach/README.md`. This doc covers state + what does NOT transfer between
computers.

## ⚠️ Machine-specific — does NOT come along via git

1. **The outreach agent runs on the OLD computer.** Windows scheduled task
   "FenceTrace Outreach Agent" (hourly 7am–2pm + 7:30pm) lives in that
   machine's Task Scheduler. If that machine is off at 7–9am, nothing sends
   and nothing scans. Either keep it on, or recreate the task on the new
   machine — but NEVER on both (double sends).
2. **Gmail OAuth files are gitignored**: `outreach/google-credentials.json`
   and `outreach/google-token.json`. Copy them manually (USB/secure channel)
   or re-run `node outreach/manage.js auth` on the new machine. The Google
   Cloud project (fencetrace-outreach) already exists; credentials JSON can
   be re-downloaded from its Credentials page.
3. **`ANTHROPIC_API_KEY`** is a user-level env var on the old machine —
   set it on the new one (needed by `manage.js scan` / `agent`).
4. **AWS CLI credentials** — needed for deploys and the DKIM command.
5. `outreach/crm.json` IS committed — pipeline state transfers fine.

## Where everything stands

**Outreach (live, semi-autonomous)**
- Batch 1 of 5 sent 2026-06-10 6:33pm from portertoddc@gmail.com (Sam's
  Fence Richmond, Valenzuela Denver, ProBuilt Boise, Defender Greenville,
  Florida Fence Tampa). 15 prospects remain; agent sends 5/day Tue–Thu,
  7–9am prospect-local. `node outreach/manage.js status` shows the table.
- Replies: agent classifies with Claude Opus 4.8 and leaves drafted
  responses in Gmail Drafts for review. Never auto-sends drafts.
- `/standup` in Claude Code = morning brief (committed in .claude/commands).

**Product (all live on prod)**
- Pro is $29/mo end-to-end (site, Stripe price + SSM + prod Lambda).
  Stripe statement descriptor/public name set to FENCETRACE (verify both
  saved in dashboard).
- Website lead widget shipped: Account → Website gives contractors a
  copy-paste button; homeowner sketches + submits → lead in Estimates +
  notification. Leads never count against the Starter 2/month cap, never
  enter market-rollup data. Public endpoints: GET /api/public/company/{id},
  POST /api/public/lead.
- Price book is free-tier (modal/landing copy fixed); first-visit demo shows
  real profit (sample $12/ft + 20%).
- 7-angle code review ran over the day's diff; all critical findings fixed
  and deployed (commit 624ac56). Deferred cleanups listed in that commit's
  era: shared rate-limiter, dedupe agent/manual send loops, lead-detail UI
  (email+notes currently only visible in the notification), scan efficiency.

**Business**
- Virginia DBA "FenceTrace" under Ravenwing LLC: FILED + effective
  2026-06-10 (SCC filing 26061010117517).
- Trademark "Fence Trace": filed 2026-03-17, serial 99708436, class 042.
  Nothing due; check TSDR quarterly (next ~Sep 2026); expect possible
  descriptiveness office action late 2026 — reply by its deadline. Ignore
  non-uspto.gov invoices (scams).
- CAN-SPAM: compliant — opt-out P.S. + postal footer (8115 Judith Ln Unit
  2008, Mechanicsville VA) on all outreach. CONFIRM that address actually
  receives Todd's mail; if not, swap to Stephens Manor in
  outreach/build-body.js (ADDRESS const).

## Pending on Todd (in priority order)

1. **DKIM**: paste into any terminal at repo root (signs the APP's email —
   noreply@fencetrace.com trial reminders/digest; outreach unaffected):
   `aws route53 change-resource-record-sets --hosted-zone-id Z034210220UJFLSY9V2RP --change-batch file://outreach/dkim-records.json`
   then poll until SUCCESS:
   `aws sesv2 get-email-identity --email-identity fencetrace.com --region us-east-1 --query DkimAttributes.Status --output text`
2. **Bank**: add "DBA FenceTrace" to the LLC account (certificate PDF is in
   the SCC CIS account).
3. **Confirm footer address** (above).
4. Optional after DKIM SUCCESS: Gmail "Send mail as" todd@fencetrace.com via
   SES SMTP (inbound to @fencetrace.com already forwards to Gmail via the
   email-forwarder Lambda).

## Known environment quirks (hard-won today)

- The claude.ai Gmail connector rewrites every URL in drafts it creates into
  expiring google.com/url redirects — never use it to create outreach drafts.
  The raw Gmail API (manage.js) is clean.
- `outreach/send-outreach.js` (SES sender) is hard-disabled; it tracks
  sent-state separately and would double-email prospects. Don't --force it
  without reconciling crm.json.
- Dev Stripe still points at the old $4.99 test price (SSM
  fencecalc.dev.stripe-price-pro) — cosmetic, fix whenever.
- Deploys: `npx serverless deploy --stage dev|prod` (backend),
  `npx serverless client deploy --stage dev|prod --no-confirm` (frontend;
  prod also needs the CloudFront invalidation in package.json's deploy:prod).
