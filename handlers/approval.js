const db = require('./lib/dynamo');
const auth = require('./lib/auth');
const res = require('./lib/response');
const crypto = require('crypto');
const { checkPermission } = require('./roles');

// POST /api/estimates/{id}/share — generate share token, set approvalStatus to 'sent'
module.exports.share = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();
  if (!await checkPermission(event, companyId, 'estimates.edit')) return res.forbidden('No permission');

  const id = event.pathParameters.id;
  const { items } = await db.query('COMPANY#' + companyId, 'EST#', 50);
  const est = items.find(i => i.id === id);
  if (!est) return res.notFound();

  // Reuse existing token if already shared, or generate a new one
  const shareToken = est.shareToken || crypto.randomUUID();

  const updates = {
    shareToken,
    approvalStatus: 'sent',
    GSI1PK: 'SHARE#' + shareToken,
    GSI1SK: 'COMPANY#' + companyId,
    updatedAt: new Date().toISOString()
  };

  // Initialize approvalHistory if not present
  if (!est.approvalHistory) {
    updates.approvalHistory = [{
      action: 'sent',
      timestamp: new Date().toISOString()
    }];
  }

  await db.update(est.PK, est.SK, updates);

  const origin = event.headers?.origin || event.headers?.Origin || '';
  const link = origin + '/approve.html?token=' + shareToken;

  return res.ok({ shareToken, link });
};

// GET /api/public/estimate/{token} — NO AUTH, public read-only view
module.exports.getPublic = async (event) => {
  const token = event.pathParameters.token;
  if (!token) return res.bad('Missing token');

  const items = await db.queryGSI('SHARE#' + token);
  if (items.length === 0) return res.notFound('Estimate not found');

  const est = items[0];

  // Look up company name
  const companyId = (est.GSI1SK || '').replace('COMPANY#', '');
  let companyName = '';
  if (companyId) {
    const company = await db.get('COMPANY#' + companyId, 'PROFILE');
    if (company) companyName = company.companyName || company.name || '';
  }

  // Return only public-safe fields
  return res.ok({
    customerName: est.customerName || '',
    customerPhone: est.customerPhone || '',
    customerAddress: est.customerAddress || '',
    fenceType: est.fenceType || '',
    fenceHeight: est.fenceHeight || 6,
    fencePrice: est.fencePrice || 0,
    totalFeet: est.totalFeet || 0,
    totalCost: est.totalCost || 0,
    materialsCost: est.materialsCost || 0,
    bom: est.bom || [],
    gates: (est.gates || []).map(g => ({ type: g.type, price: g.price })),
    mulchAreas: est.mulchAreas || [],
    mulchMaterial: est.mulchMaterial || 'hardwood',
    mulchDepth: est.mulchDepth || 3,
    mulchDelivery: est.mulchDelivery || 'bags',
    addons: est.addons || {},
    approvalStatus: est.approvalStatus || 'draft',
    approvalHistory: est.approvalHistory || [],
    companyName,
    createdAt: est.createdAt || ''
  });
};

// POST /api/public/estimate/{token}/respond — NO AUTH, customer responds
module.exports.respond = async (event) => {
  const token = event.pathParameters.token;
  if (!token) return res.bad('Missing token');

  const body = res.parseBody(event);
  if (!body) return res.bad('Invalid JSON');
  const action = body.action;
  const message = body.message || '';

  if (!['approved', 'changes_requested'].includes(action)) {
    return res.bad('Invalid action. Must be "approved" or "changes_requested".');
  }

  const items = await db.queryGSI('SHARE#' + token);
  if (items.length === 0) return res.notFound('Estimate not found');

  const est = items[0];

  const historyEntry = {
    action,
    message,
    timestamp: new Date().toISOString()
  };

  const history = est.approvalHistory || [];
  history.push(historyEntry);

  await db.update(est.PK, est.SK, {
    approvalStatus: action,
    approvalHistory: history,
    updatedAt: new Date().toISOString()
  });

  return res.ok({ approvalStatus: action, message: 'Response recorded' });
};
