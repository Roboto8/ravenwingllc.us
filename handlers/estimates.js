const db = require('./lib/dynamo');
const auth = require('./lib/auth');
const res = require('./lib/response');
const crypto = require('crypto');
const { checkPermission } = require('./roles');

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
  if (!canCreate(company)) return res.forbidden('Trial expired. Please subscribe.');

  // Enforce Solo tier estimate limit (20)
  if (company.tier === 'solo') {
    const { items } = await db.query('COMPANY#' + companyId, 'EST#', 21);
    const active = items.filter(i => i.status !== 'deleted');
    if (active.length >= 20) {
      return res.forbidden('Solo plan limit reached (20 estimates). Upgrade to Pro for unlimited.');
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
  const allowed = [
    'customerName', 'customerPhone', 'customerAddress', 'customerEmail',
    'fenceType', 'fencePrice', 'fenceHeight', 'terrainMultiplier',
    'fencePoints', 'fenceClosed', 'sections', 'gates', 'addons', 'bom',
    'mulchAreas', 'mulchMaterial', 'mulchDepth', 'mulchDelivery',
    'totalFeet', 'totalCost', 'materialsCost', 'status', 'droneOverlay', 'photos',
    'approvalStatus', 'shareToken', 'approvalHistory'
  ];

  const updates = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  updates.updatedAt = new Date().toISOString();

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
  const arrayFields = ['fencePoints', 'gates', 'bom', 'sections', 'mulchAreas', 'photos'];
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
    const validEstStatuses = ['draft', 'sent', 'approved', 'declined', 'deleted'];
    if (!validEstStatuses.includes(body.status)) return 'Invalid status';
  }
  return null;
}

function canCreate(company) {
  if (!company) return false;
  if (company.subscriptionStatus === 'active') return true;
  if (company.subscriptionStatus === 'trialing') {
    return new Date(company.trialEndsAt) > new Date();
  }
  return false;
}
