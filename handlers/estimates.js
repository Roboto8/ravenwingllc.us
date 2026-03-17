const db = require('./lib/dynamo');
const auth = require('./lib/auth');
const res = require('./lib/response');
const crypto = require('crypto');

module.exports.list = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const limit = parseInt(event.queryStringParameters?.limit || '20');
  const lastKey = event.queryStringParameters?.cursor;

  const { items, nextKey } = await db.query('COMPANY#' + companyId, 'EST#', limit, lastKey);

  return res.ok({
    estimates: items.filter(i => i.status !== 'deleted').map(stripKeys),
    cursor: nextKey
  });
};

module.exports.create = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  // Check subscription
  const company = await db.get('COMPANY#' + companyId, 'PROFILE');
  if (!canCreate(company)) return res.forbidden('Trial expired. Please subscribe.');

  const body = JSON.parse(event.body || '{}');
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
    droneOverlay: body.droneOverlay || null,
    status: 'draft',
    createdAt: now,
    updatedAt: now
  };

  await db.put(item);
  return res.created(stripKeys(item));
};

module.exports.get = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const id = event.pathParameters.id;
  const { items } = await db.query('COMPANY#' + companyId, 'EST#', 50);
  const est = items.find(i => i.id === id);

  if (!est) return res.notFound();
  return res.ok(stripKeys(est));
};

module.exports.update = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const id = event.pathParameters.id;
  const { items } = await db.query('COMPANY#' + companyId, 'EST#', 50);
  const est = items.find(i => i.id === id);
  if (!est) return res.notFound();

  const body = JSON.parse(event.body || '{}');
  const allowed = [
    'customerName', 'customerPhone', 'customerAddress',
    'fenceType', 'fencePrice', 'fenceHeight', 'terrainMultiplier',
    'fencePoints', 'fenceClosed', 'gates', 'addons', 'bom',
    'totalFeet', 'totalCost', 'materialsCost', 'status', 'droneOverlay'
  ];

  const updates = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  updates.updatedAt = new Date().toISOString();

  const updated = await db.update(est.PK, est.SK, updates);
  return res.ok(stripKeys(updated));
};

module.exports.remove = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const id = event.pathParameters.id;
  const { items } = await db.query('COMPANY#' + companyId, 'EST#', 50);
  const est = items.find(i => i.id === id);
  if (!est) return res.notFound();

  // Soft delete — move to trash instead of permanent delete
  await db.update(est.PK, est.SK, {
    status: 'deleted',
    deletedAt: new Date().toISOString()
  });
  return res.ok({ deleted: true });
};

// Permanently delete (called by cleanup or manual purge)
module.exports.purge = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const id = event.pathParameters.id;
  const { items } = await db.query('COMPANY#' + companyId, 'EST#', 50);
  const est = items.find(i => i.id === id);
  if (!est) return res.notFound();

  await db.remove(est.PK, est.SK);
  return res.ok({ purged: true });
};

// Restore from trash
module.exports.restore = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const id = event.pathParameters.id;
  const { items } = await db.query('COMPANY#' + companyId, 'EST#', 50);
  const est = items.find(i => i.id === id);
  if (!est) return res.notFound();

  await db.update(est.PK, est.SK, {
    status: 'draft',
    deletedAt: ''
  });
  return res.ok(stripKeys(est));
};

// List deleted estimates (trash)
module.exports.trash = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const { items } = await db.query('COMPANY#' + companyId, 'EST#', 50);
  const deleted = items.filter(i => i.status === 'deleted');

  return res.ok({
    estimates: deleted.map(stripKeys)
  });
};

function stripKeys(item) {
  const { PK, SK, GSI1PK, GSI1SK, ...rest } = item;
  return rest;
}

function canCreate(company) {
  if (!company) return false;
  if (company.subscriptionStatus === 'active') return true;
  if (company.subscriptionStatus === 'trialing') {
    return new Date(company.trialEndsAt) > new Date();
  }
  return false;
}
