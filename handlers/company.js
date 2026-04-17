const db = require('./lib/dynamo');
const auth = require('./lib/auth');
const res = require('./lib/response');
const { checkPermission } = require('./roles');

module.exports.get = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden('No company found');

  const company = await db.get('COMPANY#' + companyId, 'PROFILE');
  if (!company) return res.notFound('Company not found');

  // Pricebook and company email are company-confidential; only users who can edit
  // the company (or manage billing) get the full payload. Other members see a
  // public-facing subset sufficient for rendering.
  const canSeeConfidential =
    (await checkPermission(event, companyId, 'company.edit')) ||
    (await checkPermission(event, companyId, 'billing.manage'));

  const base = {
    id: companyId,
    name: company.name,
    phone: company.phone,
    accentColor: company.accentColor,
    tagline: company.tagline,
    logoKey: company.logoKey,
    logo: company.logo || null,
    subscriptionStatus: company.subscriptionStatus,
    trialEndsAt: company.trialEndsAt,
    region: company.region || 'national',
    language: company.language || 'en'
  };
  if (canSeeConfidential) {
    base.email = company.email;
    base.address = company.address;
    base.pricebook = company.pricebook || {};
  }
  return res.ok(base);
});

module.exports.update = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden('No company found');
  if (!await checkPermission(event, companyId, 'company.edit')) return res.forbidden('No permission to edit company');

  const body = res.parseBody(event);
  if (!body) return res.bad('Invalid JSON');
  const allowed = ['name', 'phone', 'accentColor', 'tagline', 'address', 'logoKey', 'logo', 'region', 'pricebook', 'language', 'emailOptOut'];
  const stringFields = ['name', 'phone', 'tagline', 'address', 'logoKey', 'logo', 'region', 'language'];
  const updates = {};

  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  // Validate string field lengths
  for (const key of stringFields) {
    if (updates[key] !== undefined && typeof updates[key] === 'string' && updates[key].length > 500) {
      return res.bad(key + ' must be 500 characters or fewer');
    }
  }

  // Validate pricebook size
  if (updates.pricebook !== undefined) {
    try {
      if (JSON.stringify(updates.pricebook).length > 10000) {
        return res.bad('Pricebook data is too large');
      }
    } catch (e) {
      return res.bad('Invalid pricebook data');
    }
  }

  // Validate accentColor format
  if (updates.accentColor !== undefined && updates.accentColor !== '') {
    if (typeof updates.accentColor !== 'string' || !/^#[0-9a-fA-F]{3,8}$/.test(updates.accentColor)) {
      return res.bad('accentColor must be a valid hex color (e.g. #ff5500)');
    }
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
