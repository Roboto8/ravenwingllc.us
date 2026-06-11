// FenceTrace outreach manager — Gmail (direct API) + Claude Opus 4.8.
//
//   node outreach/manage.js auth        one-time Google OAuth (needs google-credentials.json)
//   node outreach/manage.js status      pipeline table: who's drafted/sent/replied
//   node outreach/manage.js send        send next batch from your Gmail (default 5; --batch N)
//   node outreach/manage.js send --dry  preview what WOULD send
//   node outreach/manage.js scan        pull replies, classify with Claude, draft responses
//   node outreach/manage.js followups   draft follow-ups for no-reply prospects (--days N, default 5)
//
// State lives in outreach/crm.json. Replies are CLASSIFIED and DRAFTED only —
// nothing outbound ever goes without you pressing send, except the `send`
// command itself, which is explicit.
//
// Requires: ANTHROPIC_API_KEY env var (scan/followups), Google OAuth (all gmail ops).
// Gmail auth files (gitignored): outreach/google-credentials.json (from Google
// Cloud Console: APIs & Services > Credentials > OAuth client ID > Desktop app,
// with the Gmail API enabled) and outreach/google-token.json (created by `auth`).

const fs = require('fs');
const path = require('path');
const { buildBody, buildFollowupBody, htmlWrap, ADDRESS } = require('./build-body');

const DIR = __dirname;
const CREDENTIALS_PATH = path.join(DIR, 'google-credentials.json');
const TOKEN_PATH = path.join(DIR, 'google-token.json');
const CRM_PATH = path.join(DIR, 'crm.json');
const PROSPECTS = JSON.parse(fs.readFileSync(path.join(DIR, 'prospects.json'), 'utf8'));
const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

const CLAUDE_MODEL = 'claude-opus-4-8';

// ---------- state ----------
function loadCrm() {
  return fs.existsSync(CRM_PATH) ? JSON.parse(fs.readFileSync(CRM_PATH, 'utf8')) : {};
}
function saveCrm(crm) {
  fs.writeFileSync(CRM_PATH, JSON.stringify(crm, null, 2));
}
function rec(crm, email) {
  if (!crm[email]) {
    const p = PROSPECTS.find((x) => x.to === email);
    crm[email] = { company: p ? p.company : email, status: 'new', history: [] };
  }
  return crm[email];
}
function note(r, text) {
  r.history.push(new Date().toISOString().slice(0, 16) + ' ' + text);
}

// ---------- gmail ----------
async function gmailClient() {
  const { google } = require('googleapis');
  if (fs.existsSync(TOKEN_PATH)) {
    const auth = google.auth.fromJSON(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));
    return google.gmail({ version: 'v1', auth });
  }
  throw new Error('Not authorized. Run: node outreach/manage.js auth');
}

async function doAuth() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('Missing ' + CREDENTIALS_PATH);
    console.error('Create an OAuth "Desktop app" client in Google Cloud Console');
    console.error('(enable the Gmail API first) and save the JSON there.');
    process.exit(1);
  }
  const { authenticate } = require('@google-cloud/local-auth');
  const client = await authenticate({ scopes: SCOPES, keyfilePath: CREDENTIALS_PATH });
  const keys = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const key = keys.installed || keys.web;
  fs.writeFileSync(TOKEN_PATH, JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  }, null, 2));
  console.log('Authorized. Token saved to ' + TOKEN_PATH);
}

function b64url(s) {
  return Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Non-ASCII header values (em-dashes in subjects) must be RFC 2047 encoded
// or Gmail renders mojibake like "Ã¢Â€Â".
function encodeHeader(value) {
  return /[^\x20-\x7e]/.test(value)
    ? '=?UTF-8?B?' + Buffer.from(value, 'utf8').toString('base64') + '?='
    : value;
}

// multipart/alternative: plain text + light branded HTML (see build-body.js)
function mime({ to, subject, body, inReplyTo, references }) {
  const boundary = 'ft' + Math.random().toString(36).slice(2);
  const html = htmlWrap(body);
  const lines = [
    'To: ' + to,
    'Subject: ' + encodeHeader(subject),
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + boundary + '"',
  ];
  if (inReplyTo) lines.push('In-Reply-To: ' + inReplyTo);
  if (references) lines.push('References: ' + references);
  lines.push(
    '',
    '--' + boundary,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body, 'utf8').toString('base64'),
    '--' + boundary,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
    '--' + boundary + '--'
  );
  return b64url(lines.join('\r\n'));
}

function header(msg, name) {
  const h = (msg.payload.headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

function plainText(payload) {
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf8');
  }
  for (const part of payload.parts || []) {
    const t = plainText(part);
    if (t) return t;
  }
  return '';
}

// ---------- claude ----------
function claude() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Set ANTHROPIC_API_KEY first.');
    process.exit(1);
  }
  const Anthropic = require('@anthropic-ai/sdk');
  return new Anthropic();
}

const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    category: {
      type: 'string',
      enum: ['interested', 'question', 'objection', 'not_interested', 'opt_out', 'auto_reply', 'bounce', 'other'],
    },
    summary: { type: 'string', description: 'One sentence: what they said.' },
    needs_reply: { type: 'boolean' },
    objection_type: {
      type: 'string',
      enum: ['grade_terrain', 'pricing_model', 'price_anchoring', 'data_ownership', 'price_updates', 'vendor_trust', 'scope_commercial_ag', 'other'],
      description: 'Only when category is objection or question: the closest matching objection.',
    },
  },
  required: ['category', 'summary', 'needs_reply'],
  additionalProperties: false,
};

async function classify(ai, company, outbound, reply) {
  const resp = await ai.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    output_config: { format: { type: 'json_schema', schema: CLASSIFY_SCHEMA } },
    messages: [{
      role: 'user',
      content: 'Classify this reply to a cold outreach email about FenceTrace (fence-estimating software).\n' +
        'If the category is objection or question, also set objection_type to the closest match.\n\n' +
        'Prospect: ' + company + '\n\nOriginal email:\n' + outbound + '\n\nTheir reply:\n' + reply,
    }],
  });
  return JSON.parse(resp.content.find((b) => b.type === 'text').text);
}

const REPLY_SYSTEM = [
  'You draft replies for Todd, the solo founder of FenceTrace (fencetrace.com),',
  'responding to fence-company owners who answered his cold outreach. Voice:',
  'plain, brief, no hype, like one tradesman emailing another. Facts you may use:',
  '- Free Starter plan: 2 estimates/month, INCLUDES a custom price book (their',
  '  material costs, labor rates, markup, job minimum).',
  '- Pro is $29/month: unlimited estimates, customer approvals via link, job',
  '  site photos, PDF export. Month to month, cancel anytime, no contract.',
  '- Estimates come from drawing the fence line on a satellite photo; full bill',
  '  of materials (posts, rails, pickets, concrete); profit shown before sending.',
  '- Leads are never shared; there are no per-lead fees.',
  '- Onboarding is over email: if they send their prices/rates, Todd loads their',
  '  price book for them. Do NOT offer phone calls.',
  '- Website widget: in Account > Website there is a copy-paste button snippet',
  '  for their own site. Homeowners sketch their fence and the lead lands in the',
  '  contractor FenceTrace estimates list with a notification. Works on every plan,',
  '  including free, and incoming leads never count against the Starter limit.',
  '- Estimates are an itemized bill of materials (posts, rails, pickets, concrete',
  '  bags) priced from the contractor\'s own price book. The contractor reviews',
  '  and adjusts everything — tear-out, haul-away, grading, rock/hard-soil, and',
  '  permits are toggleable line items — BEFORE anything is shared with a customer.',
  '  Nothing reaches a customer until the contractor explicitly saves and sends',
  '  a link.',
  '- The satellite photo does the measuring takeoff; the site walk confirms ground',
  '  conditions. It\'s for the quote, not the build.',
  '- If satellite imagery is stale or tree-covered, contractors can overlay their',
  '  own drone photo and trace on that. Site photos can be attached to estimates.',
  '- The contractor owns their data (Terms of Service §12.1 — "you retain all',
  '  ownership rights"). Their price book is never shown to other contractors and',
  '  never exposed on public endpoints. Data stays available for 90 days after',
  '  cancellation, and is deleted on request.',
  '- Prices are the contractor\'s to edit anytime in the app (tap any price, or',
  '  the Pricing tab). Todd will also update their price book for them on request',
  '  via email.',
  '- FenceTrace is built for residential fence quoting. It is NOT for commercial',
  '  blueprint bids or agricultural acreage wire — concede that plainly if asked.',
  'Rules: answer their actual question first. Keep it under 120 words. No links',
  'unless they asked how to try it (then https://fencetrace.com). Do NOT include',
  'a sign-off or signature — it is appended automatically. Output ONLY the email',
  'body text, no subject line. For hard-trust questions (data ownership, what',
  'happens if you disappear, pricing accuracy), keep the draft short, factual,',
  'and free of marketing superlatives. If a question can\'t be answered from',
  'these facts, flag it for Todd in the draft rather than improvising an answer.',
].join('\n');

async function draftReply(ai, company, outbound, reply) {
  const resp = await ai.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    system: REPLY_SYSTEM,
    messages: [{
      role: 'user',
      content: 'Prospect: ' + company + '\n\nMy original email:\n' + outbound + '\n\nTheir reply:\n' + reply + '\n\nDraft my response.',
    }],
  });
  return resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

// ---------- commands ----------
async function cmdStatus() {
  const crm = loadCrm();
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('STATUS', 18) + pad('PROSPECT', 44) + 'LAST EVENT');
  for (const p of PROSPECTS) {
    const r = crm[p.to] || { status: 'new', history: [] };
    console.log(pad(r.status, 18) + pad(p.company.slice(0, 42), 44) + (r.history[r.history.length - 1] || ''));
  }
}

async function cmdSend(args) {
  const dry = args.includes('--dry');
  const bi = args.indexOf('--batch');
  const batchSize = bi > -1 ? parseInt(args[bi + 1], 10) || 5 : 5;
  const crm = loadCrm();
  const pending = PROSPECTS.filter((p) => {
    const s = (crm[p.to] || {}).status;
    return !s || s === 'new' || s === 'drafted';
  }).slice(0, batchSize);
  if (!pending.length) return console.log('Nothing pending.');
  const gmail = dry ? null : await gmailClient();
  for (const p of pending) {
    const body = buildBody(p);
    console.log('\n--- ' + p.company + ' <' + p.to + '> — "' + p.subject + '"');
    if (dry) { console.log(body.split('\n').slice(0, 3).join('\n') + '\n...'); continue; }
    const sent = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: mime({ to: p.to, subject: p.subject, body }) },
    });
    const r = rec(crm, p.to);
    r.status = 'sent';
    r.sentAt = new Date().toISOString();
    r.threadId = sent.data.threadId;
    note(r, 'sent round-1 email');
    saveCrm(crm);
    console.log('sent ✓');
    await new Promise((res) => setTimeout(res, 5000));
  }
  if (!dry) console.log('\nBatch done. Run again tomorrow for the next ' + batchSize + '.');
}

async function cmdScan() {
  const gmail = await gmailClient();
  const ai = claude();
  const crm = loadCrm();
  for (const p of PROSPECTS) {
    const r = rec(crm, p.to);
    if (r.status === 'opted_out') continue;
    const res = await gmail.users.threads.list({ userId: 'me', q: 'from:' + p.to });
    for (const t of res.data.threads || []) {
      const thread = await gmail.users.threads.get({ userId: 'me', id: t.id, format: 'full' });
      const msgs = thread.data.messages || [];
      const inbound = msgs.filter((m) => header(m, 'From').includes(p.to) && !(r.seenMessages || []).includes(m.id));
      if (!inbound.length) continue;
      const latest = inbound[inbound.length - 1];
      const replyText = plainText(latest.payload).slice(0, 4000);
      const outbound = buildBody(p);
      const cls = await classify(ai, p.company, outbound, replyText);
      r.seenMessages = (r.seenMessages || []).concat(inbound.map((m) => m.id));
      r.status = cls.category === 'opt_out' || cls.category === 'not_interested' ? 'opted_out' : cls.category;
      note(r, 'reply (' + cls.category + '): ' + cls.summary);
      console.log('\n' + p.company + ' → ' + cls.category.toUpperCase() + ': ' + cls.summary);
      if (cls.needs_reply && cls.category !== 'opt_out' && cls.category !== 'not_interested') {
        const body = (await draftReply(ai, p.company, outbound, replyText)) + '\n\nTodd\nFenceTrace\n\n' + ADDRESS;
        const subj = header(latest, 'Subject');
        await gmail.users.drafts.create({
          userId: 'me',
          requestBody: {
            message: {
              threadId: t.id,
              raw: mime({
                to: p.to,
                subject: /^re:/i.test(subj) ? subj : 'Re: ' + subj,
                body,
                inReplyTo: header(latest, 'Message-ID'),
                references: header(latest, 'Message-ID'),
              }),
            },
          },
        });
        note(r, 'response drafted — review in Gmail Drafts');
        console.log('  ↳ reply drafted (review in Gmail Drafts)');
      }
      saveCrm(crm);
    }
  }
  console.log('\nScan complete.');
}

async function cmdFollowups(args) {
  const di = args.indexOf('--days');
  const days = di > -1 ? parseInt(args[di + 1], 10) || 5 : 5;
  const gmail = await gmailClient();
  const crm = loadCrm();
  const due = PROSPECTS.filter((p) => {
    const r = crm[p.to];
    return r && r.status === 'sent' && r.sentAt && !r.followupAt && !r.followupSentAt &&
      (Date.now() - new Date(r.sentAt).getTime()) / 86400000 >= days;
  });
  if (!due.length) return console.log('No follow-ups due.');
  for (const p of due) {
    const body = buildFollowupBody(p);
    await gmail.users.drafts.create({
      userId: 'me',
      requestBody: { message: { raw: mime({ to: p.to, subject: 'Re: ' + p.subject, body }) } },
    });
    const r = rec(crm, p.to);
    r.followupAt = new Date().toISOString();
    note(r, 'follow-up drafted — review in Gmail Drafts');
    saveCrm(crm);
    console.log('follow-up drafted: ' + p.company);
  }
}

// ---------- agent ----------
// Autonomous runner for the scheduler. Anti-spam invariants:
//   * sends ONLY Tue/Wed/Thu, ONLY 7:00-8:59am in the PROSPECT's time zone
//   * hard cap: 5 outbound emails per calendar day, total
//   * one round-1 email per prospect ever; at most ONE follow-up after 5+
//     quiet days; replied / opted-out / bounced prospects are never touched
//   * Claude-drafted replies are NEVER auto-sent (scan leaves drafts)
const DAILY_CAP = 5;
const SEND_DAYS = [2, 3, 4]; // Tue, Wed, Thu
const FOLLOWUP_DAYS = 5;

function localHour(tz) {
  return parseInt(new Date().toLocaleString('en-US', { timeZone: tz, hour: '2-digit', hour12: false }), 10);
}

function sentTodayCount(crm) {
  const today = new Date().toISOString().slice(0, 10);
  return Object.values(crm).filter((r) =>
    (r.sentAt || '').startsWith(today) || (r.followupSentAt || '').startsWith(today)
  ).length;
}

async function cmdAgent() {
  const stamp = new Date().toISOString().slice(0, 16);
  console.log('[' + stamp + '] agent run');
  const crm = loadCrm();
  const day = new Date().getDay();
  let budget = DAILY_CAP - sentTodayCount(crm);

  if (SEND_DAYS.includes(day) && budget > 0) {
    const gmail = await gmailClient();

    // Round-1 sends, only to prospects currently in their 7-9am window
    const fresh = PROSPECTS.filter((p) => {
      const s = (crm[p.to] || {}).status;
      const h = localHour(p.tz || 'America/New_York');
      return (!s || s === 'new') && h >= 7 && h < 9;
    }).slice(0, budget);
    for (const p of fresh) {
      const body = buildBody(p);
      const sent = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: mime({ to: p.to, subject: p.subject, body }) },
      });
      const r = rec(crm, p.to);
      r.status = 'sent';
      r.sentAt = new Date().toISOString();
      r.threadId = sent.data.threadId;
      note(r, 'agent sent round-1 email');
      saveCrm(crm);
      budget--;
      console.log('  sent round-1: ' + p.company);
      await new Promise((res) => setTimeout(res, 5000));
    }

    // One follow-up max, 5+ quiet days, same local-morning window
    const due = PROSPECTS.filter((p) => {
      const r = crm[p.to];
      const h = localHour(p.tz || 'America/New_York');
      return budget > 0 && r && r.status === 'sent' && r.sentAt && !r.followupSentAt && !r.followupAt &&
        (Date.now() - new Date(r.sentAt).getTime()) / 86400000 >= FOLLOWUP_DAYS && h >= 7 && h < 9;
    }).slice(0, budget);
    for (const p of due) {
      const body = buildFollowupBody(p);
      const r = rec(crm, p.to);
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: mime({ to: p.to, subject: 'Re: ' + p.subject, body }),
          threadId: r.threadId,
        },
      });
      r.followupSentAt = new Date().toISOString();
      note(r, 'agent sent follow-up (final touch)');
      saveCrm(crm);
      budget--;
      console.log('  sent follow-up: ' + p.company);
      await new Promise((res) => setTimeout(res, 5000));
    }
    if (!fresh.length && !due.length) console.log('  nothing in send window');
  } else {
    console.log('  no sends (day/cap rules) — scan only');
  }

  // Always scan for replies; Claude drafts go to Gmail Drafts for review
  if (process.env.ANTHROPIC_API_KEY) {
    await cmdScan();
  } else {
    console.log('  scan skipped: ANTHROPIC_API_KEY not set');
  }
}

// ---------- main ----------
(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'auth') return doAuth();
  if (cmd === 'status') return cmdStatus();
  if (cmd === 'send') return cmdSend(args);
  if (cmd === 'scan') return cmdScan();
  if (cmd === 'followups') return cmdFollowups(args);
  if (cmd === 'agent') return cmdAgent();
  console.log('Usage: node outreach/manage.js <auth|status|send [--dry] [--batch N]|scan|followups [--days N]|agent>');
})().catch((err) => { console.error(err.message); process.exit(1); });
