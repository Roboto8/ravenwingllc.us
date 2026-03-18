const db = require('./lib/dynamo');
const auth = require('./lib/auth');
const res = require('./lib/response');
const { checkPermission } = require('./roles');

module.exports.get = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden('No company found');

  const company = await db.get('COMPANY#' + companyId, 'PROFILE');
  if (!company) return res.notFound('Company not found');

  return res.ok({
    id: companyId,
    name: company.name,
    email: company.email,
    phone: company.phone,
    accentColor: company.accentColor,
    tagline: company.tagline,
    address: company.address,
    logoKey: company.logoKey,
    logo: company.logo || null,
    subscriptionStatus: company.subscriptionStatus,
    trialEndsAt: company.trialEndsAt,
    region: company.region || 'national',
    pricebook: company.pricebook || {},
    language: company.language || 'en'
  });
});

module.exports.update = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden('No company found');
  if (!await checkPermission(event, companyId, 'company.edit')) return res.forbidden('No permission to edit company');

  const body = res.parseBody(event);
  if (!body) return res.bad('Invalid JSON');
  const allowed = ['name', 'phone', 'accentColor', 'tagline', 'address', 'logoKey', 'logo', 'region', 'pricebook', 'language', 'emailOptOut'];
  const updates = {};

  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) return res.bad('No valid fields');

  updates.updatedAt = new Date().toISOString();
  const updated = await db.update('COMPANY#' + companyId, 'PROFILE', updates);

  return res.ok({
    id: companyId,
    name: updated.name,
    phone: updated.phone,
    accentColor: updated.accentColor,
    tagline: updated.tagline,
    address: updated.address,
    logoKey: updated.logoKey
  });
});
