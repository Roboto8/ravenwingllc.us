# FenceTrace outreach — handoff

Updated 2026-06-10 (late). The pipeline changed completely today: sending now
runs through **`manage.js` (Gmail API + Claude Opus 4.8)**, mostly autonomously.
The old SES sender is disabled (see bottom).

## Current status (as of 2026-06-10 ~midnight)

- **Batch 1 sent** via Gmail at 6:33pm: Sam's Fence (Richmond), Valenzuela
  (Denver), ProBuilt (Boise), Defender (Greenville), Florida Fence (Tampa).
- **15 prospects pending** in `prospects.json`; the agent sends them ~5/day.
- State of every prospect lives in **`crm.json`** (committed) — the single
  source of truth for sent/replied/opted-out.
- The **website lead widget** shipped to prod tonight (Account → Website in
  the app) — replies that ask "can homeowners quote from my site?" get YES.

## The agent (runs without you)

Windows scheduled task **"FenceTrace Outreach Agent"** runs
`node outreach/manage.js agent` hourly 7am–2pm plus 7:30pm daily
(log: `agent.log`). Hard anti-spam invariants, enforced in code:

- sends **only Tue/Wed/Thu**, **only 7:00–8:59am in the prospect's own
  time zone** (each prospect in `prospects.json` is tz-tagged)
- **max 5 outbound emails per calendar day**, total
- **one round-1 email per prospect ever**; at most **one follow-up** after
  5+ quiet days; replied / opted-out prospects are never touched again
- every scan classifies new replies with Claude (`claude-opus-4-8`) and
  leaves a **drafted response in Gmail Drafts** — drafts are NEVER auto-sent

## Manual commands

```sh
node outreach/manage.js status      # pipeline table
node outreach/manage.js send --dry  # preview next batch
node outreach/manage.js send        # send next 5 now (still tracked in crm.json)
node outreach/manage.js scan        # classify replies + draft responses now
node outreach/manage.js followups   # draft follow-ups (drafts only, threaded)
```

In a Claude Code session, `/standup` gives the morning brief (agent log,
pipeline, replies, classification sanity-check, site health).

## Requirements

- `outreach/google-credentials.json` + `google-token.json` — Gmail OAuth
  (gitignored; recreate via `node outreach/manage.js auth`).
- `ANTHROPIC_API_KEY` env var (set at user level) — needed by scan/agent.

## Copy

All email copy builds from **`build-body.js`** (single source of truth):
plain text + light branded HTML, signature "Todd / FenceTrace" (no RavenWing,
no phone — Todd does not want calls), opt-out P.S., and the CAN-SPAM postal
footer ("FenceTrace · 8115 Judith Ln Unit 2008, Mechanicsville, VA 23116").
Reply-drafting facts live in `REPLY_SYSTEM` inside `manage.js` — keep it in
sync when product facts change (pricing, features). It currently knows: free
price book, $29 Pro, the website widget, email-only onboarding.

## Hard-won warnings

1. **Never create outreach drafts via the claude.ai Gmail connector** — it
   rewrites every URL into an expiring `google.com/url` redirect (verified
   three ways on 2026-06-10). The raw Gmail API used by manage.js is clean.
2. **Non-ASCII subjects must be RFC 2047 encoded** — manage.js does this;
   anything new that builds MIME by hand must too, or em-dashes mojibake.
3. **`send-outreach.js` (SES) is disabled.** It tracks sent-state in
   `sent-log.json`, which manage.js does not read — running it would
   re-email prospects and ignore opt-outs recorded in `crm.json`. It exits
   with an error unless passed `--force`. Reconcile crm.json manually first.

## Still pending: DKIM for fencetrace.com (product email deliverability)

SES has DKIM enabled but the DNS records are NOT in Route53 yet (status:
PENDING as of tonight; Claude's automode is not permitted to modify prod
DNS). Run this once, by hand:

Paste-safe in any shell (PowerShell or bash), from the repo root:

```sh
aws route53 change-resource-record-sets --hosted-zone-id Z034210220UJFLSY9V2RP --change-batch file://outreach/dkim-records.json
```

Then check until this says SUCCESS (usually < 30 min) — until then, product
email from todd@fencetrace.com is unsigned:

```sh
aws sesv2 get-email-identity --email-identity fencetrace.com --region us-east-1 --query DkimAttributes.Status --output text
```

This matters for the app's own email (approvals, notifications), not the
Gmail outreach.

## Next-round playbook (when round 1 has data)

- `node outreach/manage.js status` tells you which subject lines pulled.
- The next ~50 prospects: same research pipeline (verify every email on the
  company's own site), append to `prospects.json` with `tz`, and the agent
  drips them automatically.
- First interested reply → send the widget snippet (Account → Website) as
  the demo; first prices-in-an-email reply → load their price book for them.
