// Public lead capture — powers the "Get an Instant Fence Quote" button
// contractors embed on their own websites (fencetrace.com/?ref=COMPANY_ID).
// Homeowner draws a fence, submits contact info; the lead lands in the
// contractor's estimates list and they get a notification.
const crypto = require('crypto');
const db = require('./lib/dynamo');
const res = require('./lib/response');
const { notify } = require('./lib/notify');

// In-memory rate limit (mirrors approval.js): per company, min 5s between leads
const _leadTimestamps = {};
const RATE_LIMIT_MS = 5000;

const MAX_FIELD_LEN = 200;
const MAX_NOTES_LEN = 1000;
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

// GET /api/public/company/{id} — minimal public card for widget branding.
// Only fields a homeowner needs to see; never email, pricebook, or billing.
module.exports.getPublicCompany = res.wrap(async (event) => {
  const id = event.pathParameters && event.pathParameters.id;
  if (!id || !ID_RE.test(id)) return res.bad('Invalid company id');

  const company = await db.get('COMPANY#' + id, 'PROFILE');
  if (!company) return res.notFound('Company not found');

  return res.ok({
    id,
    name: company.name || 'your fence contractor',
    accentColor: company.accentColor || null,
    tagline: company.tagline || null,
  });
});

// POST /api/public/lead — store homeowner lead + notify the contractor.
module.exports.createLead = res.wrap(async (event) => {
  const body = res.parseBody(event);
  if (!body) return res.bad('Invalid JSON');

  const companyId = body.companyId;
  if (!companyId || !ID_RE.test(companyId)) return res.bad('Invalid company id');

  // Rate limit per company to keep widget abuse off the contractor's list
  const now = Date.now();
  if (_leadTimestamps[companyId] && now - _leadTimestamps[companyId] < RATE_LIMIT_MS) {
    return res.tooMany('Please wait a moment before submitting again');
  }
  _leadTimestamps[companyId] = now;
  for (const key in _leadTimestamps) {
    if (now - _leadTimestamps[key] > RATE_LIMIT_MS * 12) delete _leadTimestamps[key];
  }

  const company = await db.get('COMPANY#' + companyId, 'PROFILE');
  if (!company) return res.notFound('Company not found');

  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const email = String(body.email || '').trim();
  const address = String(body.address || '').trim();
  const notes = String(body.notes || '').trim();
  if (!name) return res.bad('Name is required');
  if (!phone && !email) return res.bad('A phone number or email is required');
  for (const v of [name, phone, email, address]) {
    if (v.length > MAX_FIELD_LEN) return res.bad('Field too long');
  }
  if (notes.length > MAX_NOTES_LEN) return res.bad('Notes too long');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.bad('Invalid email');

  const totalFeet = Math.max(0, Math.min(100000, Number(body.totalFeet) || 0));
  const totalCost = Math.max(0, Math.min(10000000, Number(body.totalCost) || 0));
  const fenceType = String(body.fenceType || 'wood').slice(0, 32);
  const fenceHeight = Math.max(0, Math.min(20, Number(body.fenceHeight) || 6));

  const id = crypto.randomUUID();
  const iso = new Date().toISOString();
  const item = {
    PK: 'COMPANY#' + companyId,
    SK: 'EST#' + iso + '#' + id,
    id,
    source: 'website-widget',
    customerName: name,
    customerPhone: phone,
    customerEmail: email,
    customerAddress: address,
    leadNotes: notes,
    fenceType,
    fenceHeight,
    totalFeet,
    totalCost,
    fencePoints: Array.isArray(body.fencePoints) ? body.fencePoints.slice(0, 500) : [],
    gates: [],
    bom: [],
    sections: [],
    mulchAreas: [],
    photos: [],
    status: 'draft',
    approvalStatus: 'draft',
    createdAt: iso,
    updatedAt: iso,
  };
  await db.put(item);

  await notify(db, companyId, {
    type: 'lead',
    title: 'New website lead',
    message: name + ' requested a quote' +
      (totalFeet ? ' — ~' + Math.round(totalFeet) + ' ft of ' + fenceType + ' fence' : '') +
      (phone ? ' — ' + phone : email ? ' — ' + email : ''),
    link: '/estimates/' + id,
  });

  return res.ok({ received: true });
});

// Exposed for testing
module.exports._leadTimestamps = _leadTimestamps;
