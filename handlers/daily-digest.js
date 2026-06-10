// Daily owner digest — runs at 6 AM ET, emails the business numbers + the day's
// top revenue move to the owner. This is an internal report to our own inbox
// (not customer marketing), so CAN-SPAM does not apply.
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const getStripe = require('./lib/stripe');

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);
const ses = new SESClient({});
const TABLE = process.env.DYNAMODB_TABLE;
const FROM_EMAIL = 'FenceTrace Reports <noreply@fencetrace.com>';
const OWNER_EMAIL = process.env.FORWARD_TO_EMAIL || 'portertoddc@gmail.com';

const DAY_MS = 24 * 60 * 60 * 1000;

// Pure aggregation over scanned items — kept separate so it can be unit-tested
// without AWS. `items` is the raw list of DynamoDB records (companies + estimates).
function aggregate(items, now = new Date()) {
  const nowMs = now.getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const m = {
    totalCompanies: 0,
    newSignups24h: 0,
    newSignups7d: 0,
    active: 0,
    trialing: 0,
    trialExpiring3d: 0,
    pastDue: 0,
    freeOrCanceled: 0,
    estimates24h: 0,
    estimatesMonth: 0,
    estimatesTotal: 0
  };

  for (const it of items) {
    if (it.SK === 'PROFILE') {
      m.totalCompanies++;
      const created = it.createdAt ? new Date(it.createdAt).getTime() : 0;
      if (created && nowMs - created <= DAY_MS) m.newSignups24h++;
      if (created && nowMs - created <= 7 * DAY_MS) m.newSignups7d++;

      const status = it.subscriptionStatus;
      if (status === 'active') m.active++;
      else if (status === 'trialing') {
        m.trialing++;
        const end = it.trialEndsAt ? new Date(it.trialEndsAt).getTime() : 0;
        if (end > nowMs && end - nowMs <= 3 * DAY_MS) m.trialExpiring3d++;
      } else if (status === 'past_due') m.pastDue++;
      else m.freeOrCanceled++;
    } else if (typeof it.SK === 'string' && it.SK.startsWith('EST#')) {
      if (it.status === 'deleted') continue;
      if (it.source === 'website-widget') continue; // leads ≠ created estimates
      m.estimatesTotal++;
      const created = it.createdAt ? new Date(it.createdAt).getTime() : 0;
      if (created >= monthStart) m.estimatesMonth++;
      if (created && nowMs - created <= DAY_MS) m.estimates24h++;
    }
  }
  return m;
}

// The single most important revenue action for today, derived from the numbers.
function topAction(m) {
  if (m.pastDue > 0) {
    return `${m.pastDue} subscription(s) PAST DUE — recover them before they cancel. Check Stripe dunning.`;
  }
  if (m.trialExpiring3d > 0) {
    return `${m.trialExpiring3d} trial(s) expiring within 3 days. The trial-reminder email job is currently DISABLED — enabling it converts these to paid.`;
  }
  if (m.trialing > 0) {
    return `${m.trialing} active trial(s). Nudge the ones with saved estimates — they've shown intent.`;
  }
  if (m.freeOrCanceled > m.active * 3 && m.active >= 0) {
    return `${m.freeOrCanceled} free/lapsed accounts vs ${m.active} paying. Tighten the paywall or run a win-back offer.`;
  }
  if (m.newSignups24h === 0) {
    return `Zero signups in 24h. Top of funnel is the bottleneck — drive traffic, not features.`;
  }
  return `Healthy. ${m.newSignups24h} new signup(s) yesterday — keep the funnel fed.`;
}

async function scanAll() {
  const items = [];
  let lastKey;
  do {
    const out = await ddb.send(new ScanCommand({
      TableName: TABLE,
      ProjectionExpression: 'PK, SK, createdAt, subscriptionStatus, trialEndsAt, #st',
      ExpressionAttributeNames: { '#st': 'status' },
      ExclusiveStartKey: lastKey
    }));
    (out.Items || []).forEach(i => items.push(i));
    lastKey = out.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

// MRR straight from Stripe — sum of all active subscription amounts.
async function getMrr() {
  try {
    const s = getStripe();
    let mrrCents = 0;
    let count = 0;
    let startingAfter;
    // Paginate active subscriptions
    for (let page = 0; page < 20; page++) {
      const res = await s.subscriptions.list({ status: 'active', limit: 100, starting_after: startingAfter });
      for (const sub of res.data) {
        count++;
        for (const item of sub.items.data) {
          const amt = item.price.unit_amount || 0;
          const qty = item.quantity || 1;
          const interval = item.price.recurring && item.price.recurring.interval;
          // Normalize to monthly
          mrrCents += interval === 'year' ? (amt * qty) / 12 : amt * qty;
        }
      }
      if (!res.has_more) break;
      startingAfter = res.data[res.data.length - 1].id;
    }
    return { mrr: mrrCents / 100, activeSubs: count, ok: true };
  } catch (e) {
    console.warn('Stripe MRR lookup failed:', e.message);
    return { mrr: null, activeSubs: null, ok: false };
  }
}

function money(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildHtml(m, mrr, dateStr) {
  const mrrLine = mrr.ok
    ? `<tr><td style="padding:6px 0;font-size:22px;font-weight:800;color:#c0622e">${money(mrr.mrr)}<span style="font-size:13px;font-weight:400;color:#6b6052"> MRR · ${mrr.activeSubs} paying</span></td></tr>`
    : `<tr><td style="padding:6px 0;color:#a00">MRR unavailable (Stripe lookup failed) — ${m.active} active per our DB</td></tr>`;
  const row = (label, val) => `<tr><td style="padding:4px 0;color:#6b6052;font-size:14px">${label}</td><td style="padding:4px 0;text-align:right;font-weight:700;font-size:14px">${val}</td></tr>`;
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#2c2417">
  <h2 style="color:#c0622e;margin:0 0 2px">Fence<span style="color:#2c2417">Trace</span> · daily</h2>
  <p style="color:#6b6052;margin:0 0 16px;font-size:13px">${dateStr}</p>
  <table style="width:100%;border-collapse:collapse">${mrrLine}</table>
  <table style="width:100%;border-collapse:collapse;margin-top:12px">
    ${row('Total accounts', m.totalCompanies)}
    ${row('New signups (24h)', m.newSignups24h)}
    ${row('New signups (7d)', m.newSignups7d)}
    ${row('Trials active', m.trialing)}
    ${row('Trials expiring ≤3d', m.trialExpiring3d)}
    ${row('Past due', m.pastDue)}
    ${row('Free / lapsed', m.freeOrCanceled)}
    ${row('Estimates created (24h)', m.estimates24h)}
    ${row('Estimates this month', m.estimatesMonth)}
  </table>
  <div style="margin-top:20px;padding:14px 16px;background:#fdf6f0;border-left:4px solid #c0622e;border-radius:4px">
    <div style="font-size:12px;font-weight:700;color:#c0622e;letter-spacing:.04em;text-transform:uppercase">Today's move</div>
    <div style="margin-top:4px;font-size:15px">${topAction(m)}</div>
  </div>
  </body></html>`;
}

function buildText(m, mrr, dateStr) {
  const mrrLine = mrr.ok ? `${money(mrr.mrr)} MRR · ${mrr.activeSubs} paying` : `MRR unavailable — ${m.active} active per DB`;
  return [
    `FenceTrace daily · ${dateStr}`,
    mrrLine,
    '',
    `Total accounts: ${m.totalCompanies}`,
    `New signups 24h / 7d: ${m.newSignups24h} / ${m.newSignups7d}`,
    `Trials active: ${m.trialing} (expiring <=3d: ${m.trialExpiring3d})`,
    `Past due: ${m.pastDue}`,
    `Free / lapsed: ${m.freeOrCanceled}`,
    `Estimates 24h: ${m.estimates24h} · this month: ${m.estimatesMonth}`,
    '',
    `TODAY'S MOVE: ${topAction(m)}`
  ].join('\n');
}

module.exports.handler = async () => {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const items = await scanAll();
  const m = aggregate(items, now);
  const mrr = await getMrr();

  const subjectMrr = mrr.ok ? money(mrr.mrr) + ' MRR' : m.active + ' active';
  const subject = `FenceTrace: ${subjectMrr}, ${m.newSignups24h} new, ${m.trialing} trials`;

  await ses.send(new SendEmailCommand({
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [OWNER_EMAIL] },
    Message: {
      Subject: { Data: subject },
      Body: {
        Html: { Data: buildHtml(m, mrr, dateStr) },
        Text: { Data: buildText(m, mrr, dateStr) }
      }
    }
  }));

  console.log('Daily digest sent:', JSON.stringify(m), 'mrr=', mrr.mrr);
  return { ok: true, metrics: m, mrr: mrr.mrr };
};

// Exposed for testing
module.exports.aggregate = aggregate;
module.exports.topAction = topAction;
