// GA4 snapshot for the morning standup — sessions, sources, outreach clicks.
// Supports multiple properties (FenceTrace + Skullbash share one service acct).
//
//   node outreach/ga-snapshot.js
//
// ONE-TIME SETUP (Todd, ~5 minutes, same GCP project as the Gmail OAuth client):
//   1. Google Cloud Console > APIs & Services > Library > enable
//      "Google Analytics Data API".
//   2. IAM & Admin > Service Accounts > Create (name: ga-standup) >
//      Keys > Add key > JSON. Save the file as outreach/ga-service-account.json.
//   3. GA4 > Admin > Property access management > add the service account's
//      email (...@...iam.gserviceaccount.com) with the Viewer role —
//      ON EACH PROPERTY you want in the brief (FenceTrace AND Skullbash).
//   4. GA4 > Admin > Property details > copy each numeric PROPERTY ID, then
//      create outreach/ga-config.json:
//        { "properties": [
//            { "label": "fencetrace", "propertyId": "123456789" },
//            { "label": "skullbash",  "propertyId": "987654321" } ] }
//      (legacy single form { "propertyId": "..." } also still works)
// Both files are gitignored. If config is missing this script prints one line
// and exits 0 so /standup can include it unconditionally.

const fs = require('fs');
const path = require('path');

const CFG_PATH = path.join(__dirname, 'ga-config.json');

async function snapshotProperty(analytics, label, propertyId) {
  const property = 'properties/' + propertyId;

  async function report(body) {
    const res = await analytics.properties.runReport({ property, requestBody: body });
    return res.data.rows || [];
  }

  console.log('— ' + label + ' —');

  // Headline: yesterday + today
  const totals = await report({
    dateRanges: [{ startDate: '1daysAgo', endDate: 'today' }],
    metrics: [{ name: 'activeUsers' }, { name: 'newUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }],
  });
  if (totals[0]) {
    const m = totals[0].metricValues.map((v) => v.value);
    console.log('last 48h: ' + m[0] + ' users (' + m[1] + ' new), ' + m[2] + ' sessions, ' + m[3] + ' pageviews');
  } else {
    console.log('last 48h: no data');
  }

  // Where sessions come from (7 days)
  const channels = await report({
    dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 8,
  });
  console.log('sources (7d): ' + (channels.length === 0 ? 'none' : channels
    .map((r) => r.dimensionValues[0].value + '/' + r.dimensionValues[1].value + '=' + r.metricValues[0].value)
    .join(', ')));

  // THE BITE DETECTOR (FenceTrace only) — outreach-tagged sessions per
  // prospect (utm_content carries the company slug; emails sent before
  // 2026-06-11 evening predate tagging and show as direct/(none)).
  if (label === 'fencetrace') {
    const outreach = await report({
      dateRanges: [{ startDate: '14daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'sessionCampaignName' }, { name: 'sessionManualAdContent' }, { name: 'date' }],
      metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }],
      dimensionFilter: { filter: { fieldName: 'sessionSource', stringFilter: { value: 'outreach' } } },
      orderBys: [{ dimension: { dimensionName: 'date' }, desc: true }],
      limit: 50,
    });
    if (outreach.length === 0) {
      console.log('outreach clicks: none yet');
    } else {
      console.log('outreach clicks (14d):');
      outreach.forEach((r) => {
        const d = r.dimensionValues.map((v) => v.value);
        console.log('  ' + d[2] + '  ' + (d[1] || '(unknown prospect)') + '  [' + d[0] + ']  sessions=' + r.metricValues[0].value + ' pages=' + r.metricValues[1].value);
      });
    }
  }
}

async function main() {
  if (!fs.existsSync(CFG_PATH)) {
    console.log('GA: not configured (see outreach/ga-snapshot.js header for the 5-minute setup)');
    return;
  }
  const cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
  const keyFile = path.join(__dirname, cfg.keyFile || 'ga-service-account.json');
  if (!fs.existsSync(keyFile)) {
    console.log('GA: config found but key file missing: ' + keyFile);
    return;
  }
  const { google } = require('googleapis');
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  });
  const analytics = google.analyticsdata({ version: 'v1beta', auth });

  const props = cfg.properties || [{ label: 'fencetrace', propertyId: cfg.propertyId }];
  for (const p of props) {
    if (!p.propertyId) continue;
    try {
      await snapshotProperty(analytics, p.label || p.propertyId, p.propertyId);
    } catch (e) {
      console.log('— ' + (p.label || p.propertyId) + ' — error: ' + (e.message || e));
    }
  }
}

main().catch((e) => {
  console.log('GA: error — ' + (e.message || e));
});
