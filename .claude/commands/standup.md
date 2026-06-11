---
description: Morning brief — outreach agent results, replies, pipeline status, system health
---

Give me the FenceTrace morning standup. Do these checks, then deliver a tight brief (10 lines max) with concrete recommended actions:

1. **Outreach agent**: read the last 40 lines of `outreach/agent.log` (and `outreach/scan.log` if present). Did the scheduled runs fire? Any errors? What did it send and to whom?
2. **Pipeline**: run `node outreach/manage.js status`. Summarize counts by status (new / sent / replied / interested / opted_out) and call out anything that changed since yesterday (compare against `outreach/crm.json` history timestamps).
3. **Replies**: if the Gmail connector is available, search for new replies from prospect addresses in `outreach/prospects.json` and check Drafts for agent-drafted responses awaiting review. Quote the gist of any real reply — these are the most important lines of the brief.
4. **Classify check**: if the agent classified anything, sanity-check the classification against the actual reply text and flag disagreements.
5. **Product health**: hit `https://fencetrace.com/` and confirm HTTP 200; note anything weird.
6. **Analytics**: run `node outreach/ga-snapshot.js`. If it prints "not configured", say so in one line and move on. Otherwise report users/sessions and ESPECIALLY any "outreach clicks" rows — a prospect who clicked but didn't reply is a warm lead; name the company (utm_content slug) and flag them for a tailored follow-up.
7. **Recommend**: end with "Do today:" — the 1-3 highest-leverage actions, e.g. "send the drafted reply to X", "batch N goes out automatically at 7am, nothing needed", "investigate bounce from Y", "Schmidt clicked twice yesterday — worth a personal note".

Be honest about silence — "no replies yet, day 2, normal" is a valid brief. Don't pad.
