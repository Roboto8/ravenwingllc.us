const db = require('./lib/dynamo');
const auth = require('./lib/auth');
const res = require('./lib/response');
const crypto = require('crypto');
const { checkPermission } = require('./roles');
const { countBillableSince } = require('./lib/quota');

module.exports.list = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();
  if (!await checkPermission(event, companyId, 'estimates.view')) return res.forbidden('No permission');

  const limit = parseInt(event.queryStringParameters?.limit || '20');
  const lastKey = event.queryStringParameters?.cursor;

  const { items, nextKey } = await db.query('COMPANY#' + companyId, 'EST#', limit, lastKey);

  return res.ok({
    estimates: items.filter(i => i.status !== 'deleted').map(stripKeys),
    cursor: nextKey
  });
});

module.exports.create = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();
  if (!await checkPermission(event, companyId, 'estimates.create')) return res.forbidden('No permission');

  // Check subscription
  const company = await db.get('COMPANY#' + companyId, 'PROFILE');
  if (!canCreate(company)) return res.forbidden('Subscribe to create estimates.');

  // Enforce free tier estimate limit (3 per calendar month)
  // Applies to free tier, expired trials, canceled, and expired legacy users
  const tier = company.tier || 'free';
  const isPaid = company.subscriptionStatus === 'active' || company.subscriptionStatus === 'past_due';
  if (!isPaid && (tier === 'free' || !['pro', 'builder', 'contractor'].includes(tier))) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const usedThisMonth = await countBillableSince(db, companyId, monthStart);
    // Base limit 2 + share bonus (1 if shared this month)
    const nowMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const freeLimit = 2 + (company.shareBonusMonth === nowMonth ? 1 : 0);
    if (usedThisMonth >= freeLimit) {
      const msg = freeLimit === 2
        ? 'Starter plan limit reached (2 estimates/month). Share an estimate for +1 bonus, or upgrade to Pro for unlimited.'
        : 'Starter plan limit reached (' + freeLimit + ' estimates/month). Upgrade to Pro for unlimited.';
      return res.forbidden(msg);
    }
  }

  const body = res.parseBody(event);
  if (!body) return res.bad('Invalid JSON');
  const valErr = validateInput(body);
  if (valErr) return res.bad(valErr);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const item = {
    PK: 'COMPANY#' + companyId,
    SK: 'EST#' + now + '#' + id,
    id,
    customerName: body.customerName || '',
    customerPhone: body.customerPhone || '',
    customerAddress: body.customerAddress || '',
    fenceType: body.fenceType || 'wood',
    fencePrice: body.fencePrice || 25,
    fenceHeight: body.fenceHeight || 6,
    terrainMultiplier: body.terrainMultiplier || 1,
    fencePoints: body.fencePoints || [],
    fenceClosed: body.fenceClosed || false,
    gates: body.gates || [],
    addons: body.addons || {},
    bom: body.bom || [],
    customItems: body.customItems || [],
    totalFeet: body.totalFeet || 0,
    totalCost: body.totalCost || 0,
    materialsCost: body.materialsCost || 0,
    sections: body.sections || [],
    mulchAreas: body.mulchAreas || [],
    mulchMaterial: body.mulchMaterial || 'hardwood',
    mulchDepth: body.mulchDepth || 3,
    mulchDelivery: body.mulchDelivery || 'bags',
    droneOverlay: body.droneOverlay || null,
    photos: body.photos || [],
    status: 'draft',
    approvalStatus: 'draft',
    customerEmail: body.customerEmail || '',
    createdAt: now,
    updatedAt: now
  };
  // NOTE: source is intentionally NOT copied from the request body. Widget
  // leads acquire source='website-widget' only via the public lead handler,
  // and countBillableSince exempts them from the Starter cap — trusting a
  // client-supplied source would let any free account create unlimited
  // estimates. Undo-delete restores via POST /api/estimates/{id}/restore,
  // which preserves the original item (including source) instead of
  // recreating it through this path.
  Object.assign(item, deriveMarketFields(item));

  await db.put(item);
  return res.created(stripKeys(item));
});

module.exports.get = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();
  if (!await checkPermission(event, companyId, 'estimates.view')) return res.forbidden('No permission');

  const id = event.pathParameters.id;
  const est = await db.findById('COMPANY#' + companyId, 'EST#', id);

  if (!est) return res.notFound();
  return res.ok(stripKeys(est));
});

module.exports.update = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();
  if (!await checkPermission(event, companyId, 'estimates.edit')) return res.forbidden('No permission');

  const id = event.pathParameters.id;
  const est = await db.findById('COMPANY#' + companyId, 'EST#', id);
  if (!est) return res.notFound();

  const body = res.parseBody(event);
  if (!body) return res.bad('Invalid JSON');
  const valErr = validateInput(body);
  if (valErr) return res.bad(valErr);
  // Note: approvalStatus, shareToken, and approvalHistory are intentionally NOT in this
  // list. shareToken is server-minted in handlers/approval.js (share); approvalStatus and
  // approvalHistory are written only by approval.respond. Allowing client writes here
  // would let an estimates.edit holder mint phishing tokens, self-approve estimates, and
  // forge customer responses.
  const allowed = [
    'customerName', 'customerPhone', 'customerAddress', 'customerEmail',
    'fenceType', 'fencePrice', 'fenceHeight', 'terrainMultiplier',
    'fencePoints', 'fenceClosed', 'sections', 'gates', 'addons', 'bom',
    'customItems', 'mulchAreas', 'mulchMaterial', 'mulchDepth', 'mulchDelivery',
    'totalFeet', 'totalCost', 'materialsCost', 'status', 'droneOverlay', 'photos',
    'finalPrice', 'lostReason'
  ];

  const updates = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  updates.updatedAt = new Date().toISOString();

  // Price integrity: if money-bearing fields change after the customer has
  // seen (or approved) the estimate, the old approval no longer applies —
  // drop back to 'sent' and record the revision. This is a server-side write,
  // not a client-supplied one (see the exclusion comment above).
  if (['sent', 'approved'].includes(est.approvalStatus)) {
    const moneyFields = ['totalCost', 'fencePrice', 'addons', 'gates', 'sections', 'bom', 'customItems', 'terrainMultiplier'];
    const moneyChanged = moneyFields.some(f =>
      updates[f] !== undefined && JSON.stringify(updates[f]) !== JSON.stringify(est[f])
    );
    if (moneyChanged) {
      updates.approvalStatus = 'sent';
      const history = est.approvalHistory || [];
      if (history.length < MAX_HISTORY_ENTRIES) {
        history.push({ action: 'revised', timestamp: updates.updatedAt });
        updates.approvalHistory = history;
      }
    }
  }

  // Outcome tracking for the market-data corpus: stamp transitions
  // server-side so time-to-close and win rates are trustworthy.
  if (updates.status && updates.status !== est.status) {
    if (updates.status === 'sent' && !est.sentAt) updates.sentAt = updates.updatedAt;
    if (updates.status === 'won' && !est.wonAt) updates.wonAt = updates.updatedAt;
    if (updates.status === 'lost' && !est.lostAt) updates.lostAt = updates.updatedAt;
  }
  // Widget leads carry homeowner-sketched numbers, not real quotes — never
  // mint market-rollup fields from them, even after the contractor edits.
  if (est.source !== 'website-widget') {
    Object.assign(updates, deriveMarketFields({ ...est, ...updates }));
  }

  const updated = await db.update(est.PK, est.SK, updates);
  return res.ok(stripKeys(updated));
});

module.exports.remove = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();
  if (!await checkPermission(event, companyId, 'estimates.delete')) return res.forbidden('No permission');

  const id = event.pathParameters.id;
  const est = await db.findById('COMPANY#' + companyId, 'EST#', id);
  if (!est) return res.notFound();

  // Soft delete — move to trash with 90-day TTL for auto-purge
  await db.update(est.PK, est.SK, {
    status: 'deleted',
    deletedAt: new Date().toISOString(),
    expiresAt: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60)
  });
  return res.ok({ deleted: true });
});

// Permanently delete (called by cleanup or manual purge)
module.exports.purge = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();
  if (!await checkPermission(event, companyId, 'estimates.delete')) return res.forbidden('No permission');

  const id = event.pathParameters.id;
  const est = await db.findById('COMPANY#' + companyId, 'EST#', id);
  if (!est) return res.notFound();

  // Require the estimate to already be soft-deleted so the 90-day trash window is preserved.
  if (est.status !== 'deleted') {
    return res.bad('Estimate must be in trash before it can be purged');
  }

  await db.remove(est.PK, est.SK);
  return res.ok({ purged: true });
});

// Restore from trash
module.exports.restore = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();
  if (!await checkPermission(event, companyId, 'estimates.delete')) return res.forbidden('No permission');

  const id = event.pathParameters.id;
  const est = await db.findById('COMPANY#' + companyId, 'EST#', id);
  if (!est) return res.notFound();

  await db.update(est.PK, est.SK, {
    status: 'draft',
    deletedAt: '',
    expiresAt: 0
  });
  return res.ok(stripKeys(est));
});

// List deleted estimates (trash) - server-side filtered
module.exports.trash = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();
  if (!await checkPermission(event, companyId, 'estimates.view')) return res.forbidden('No permission');

  const limit = parseInt(event.queryStringParameters?.limit || '50');
  const lastKey = event.queryStringParameters?.cursor;

  const { items, nextKey } = await db.queryFiltered(
    'COMPANY#' + companyId, 'EST#',
    '#s = :del', { ':del': 'deleted' },
    limit, lastKey, { '#s': 'status' }
  );

  return res.ok({
    estimates: items.map(stripKeys),
    cursor: nextKey
  });
});

function stripKeys(item) {
  const { PK, SK, GSI1PK, GSI1SK, ...rest } = item;
  return rest;
}

// Input validation limits
const MAX_STRING = 500;
const MAX_ARRAY = 1000;
const MAX_BOM = 500;
const MAX_CUSTOM_ITEMS = 50;
const MAX_HISTORY_ENTRIES = 50; // matches the respond() cap in handlers/approval.js

function validateInput(body) {
  const stringFields = ['customerName', 'customerPhone', 'customerAddress', 'customerEmail', 'fenceType', 'mulchMaterial', 'mulchDelivery'];
  for (const f of stringFields) {
    if (body[f] !== undefined && typeof body[f] !== 'string') return f + ' must be a string';
    if (body[f] && body[f].length > MAX_STRING) return f + ' exceeds maximum length';
  }
  const numericFields = ['fencePrice', 'fenceHeight', 'terrainMultiplier', 'totalFeet', 'totalCost', 'materialsCost', 'mulchDepth'];
  for (const f of numericFields) {
    if (body[f] !== undefined) {
      // Coerce numeric strings (e.g. "$2,500" from older clients)
      if (typeof body[f] === 'string') {
        const parsed = parseFloat(body[f].replace(/[^0-9.\-]/g, ''));
        if (isNaN(parsed)) return f + ' must be a number';
        body[f] = parsed;
      }
      if (typeof body[f] !== 'number' || !isFinite(body[f])) return f + ' must be a number';
    }
  }
  const arrayFields = ['fencePoints', 'gates', 'bom', 'customItems', 'sections', 'mulchAreas', 'photos'];
  for (const f of arrayFields) {
    if (body[f] !== undefined && !Array.isArray(body[f])) return f + ' must be an array';
  }
  if (body.fencePoints && Array.isArray(body.fencePoints) && body.fencePoints.length > MAX_ARRAY) {
    return 'Too many fence points (max ' + MAX_ARRAY + ')';
  }
  if (body.gates && Array.isArray(body.gates) && body.gates.length > 100) {
    return 'Too many gates (max 100)';
  }
  if (body.bom && Array.isArray(body.bom) && body.bom.length > MAX_BOM) {
    return 'Too many BOM items (max ' + MAX_BOM + ')';
  }
  if (body.customItems && Array.isArray(body.customItems)) {
    if (body.customItems.length > MAX_CUSTOM_ITEMS) {
      return 'Too many custom items (max ' + MAX_CUSTOM_ITEMS + ')';
    }
    for (const ci of body.customItems) {
      if (!ci || typeof ci !== 'object' || Array.isArray(ci)) return 'Invalid custom item';
      if (typeof ci.name !== 'string') return 'Custom item name must be a string';
      ci.name = ci.name.trim();
      if (ci.name.length > 200) return 'Custom item name exceeds maximum length';
      if (typeof ci.qty !== 'number' || !isFinite(ci.qty) || ci.qty < 0 || ci.qty > 10000) {
        return 'Invalid custom item qty';
      }
      if (typeof ci.unitCost !== 'number' || !isFinite(ci.unitCost) || ci.unitCost < 0 || ci.unitCost > 1000000) {
        return 'Invalid custom item unitCost';
      }
    }
  }
  if (body.sections && Array.isArray(body.sections) && body.sections.length > 50) {
    return 'Too many sections (max 50)';
  }
  if (body.mulchAreas && Array.isArray(body.mulchAreas) && body.mulchAreas.length > 100) {
    return 'Too many mulch areas (max 100)';
  }
  if (body.photos && Array.isArray(body.photos) && body.photos.length > 50) {
    return 'Too many photos (max 50)';
  }
  if (body.approvalHistory !== undefined) {
    if (!Array.isArray(body.approvalHistory)) return 'approvalHistory must be an array';
    if (body.approvalHistory.length > 100) return 'Too many approval history entries (max 100)';
  }
  const validStatuses = ['draft', 'sent', 'approved', 'declined'];
  if (body.approvalStatus !== undefined && !validStatuses.includes(body.approvalStatus)) {
    return 'Invalid approval status';
  }
  if (body.status !== undefined) {
    const validEstStatuses = ['draft', 'sent', 'approved', 'declined', 'deleted', 'won', 'lost'];
    if (!validEstStatuses.includes(body.status)) return 'Invalid status';
  }
  if (body.finalPrice !== undefined) {
    if (typeof body.finalPrice !== 'number' || !isFinite(body.finalPrice) ||
        body.finalPrice < 0 || body.finalPrice > 10000000) {
      return 'Invalid finalPrice';
    }
  }
  if (body.lostReason !== undefined) {
    if (typeof body.lostReason !== 'string' || body.lostReason.length > 500) {
      return 'Invalid lostReason';
    }
  }
  return null;
}

// ---- Market-data derivation (the pricing-benchmark corpus) ----
// regionKey: fence centroid snapped to a 0.1° grid (~7 miles). Coarse enough
// that aggregates can't identify a property, fine enough for "fences near
// you" benchmarks. pricePerFoot is stored denormalized so the nightly rollup
// never has to re-derive it from drifting client math.
function deriveMarketFields(est) {
  const out = {};
  const pts = Array.isArray(est.fencePoints)
    ? est.fencePoints.filter(p => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number')
    : [];
  if (pts.length) {
    const lat = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const lng = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    out.regionKey = lat.toFixed(1) + ',' + lng.toFixed(1);
  }
  const feet = Number(est.totalFeet);
  const cost = Number(est.totalCost);
  if (feet > 0 && cost > 0) {
    out.pricePerFoot = Math.round((cost / feet) * 100) / 100;
  }
  return out;
}

function canCreate(company) {
  if (!company) return false;
  if (company.subscriptionStatus === 'active') return true;
  if (company.subscriptionStatus === 'past_due') return true;
  if (company.subscriptionStatus === 'free') return true;
  if (company.subscriptionStatus === 'trialing') return true; // expired trials fall through to free tier limit
  if (company.subscriptionStatus === 'canceled') return true; // canceled users get free tier
  // expired status from legacy signups — treat as free tier
  if (company.subscriptionStatus === 'expired') return true;
  return false;
}
