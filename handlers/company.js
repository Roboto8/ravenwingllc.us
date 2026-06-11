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
    base.benchmarkOptOut = company.benchmarkOptOut === true;
  }
  return res.ok(base);
});

module.exports.update = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden('No company found');
  if (!await checkPermission(event, companyId, 'company.edit')) return res.forbidden('No permission to edit company');

  const body = res.parseBody(event);
  if (!body) return res.bad('Invalid JSON');
  const allowed = ['name', 'phone', 'accentColor', 'tagline', 'address', 'logoKey', 'logo', 'region', 'pricebook', 'language', 'emailOptOut', 'benchmarkOptOut'];
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

  // Validate pricebook size + shape. The pricebook is a flat map of dotted
  // keys to numbers: material overrides ('wood.6.postCost'), labor rates
  // ('labor.wood.6', 'labor.gate'), markup rules ('markup.percent',
  // 'markup.jobMin'). Quotes are money — reject anything that isn't a finite
  // non-negative number so one bad client write can't NaN every estimate the
  // contractor sends afterward.
  if (updates.pricebook !== undefined) {
    try {
      if (typeof updates.pricebook !== 'object' || updates.pricebook === null || Array.isArray(updates.pricebook)) {
        return res.bad('Invalid pricebook data');
      }
      if (JSON.stringify(updates.pricebook).length > 10000) {
        return res.bad('Pricebook data is too large');
      }
      const entries = Object.entries(updates.pricebook);
      if (entries.length > 500) return res.bad('Too many pricebook entries (max 500)');
      for (const [k, v] of entries) {
        if (k.length > 64) return res.bad('Pricebook key too long: ' + k.slice(0, 64));
        if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 1000000) {
          return res.bad('Pricebook value for "' + k + '" must be a number between 0 and 1,000,000');
        }
      }
    } catch (e) {
      return res.bad('Invalid pricebook data');
    }
  }

  // benchmarkOptOut excludes this company's estimates from the anonymized
  // market-rollup corpus — must be a real boolean, not a truthy string.
  if (updates.benchmarkOptOut !== undefined && typeof updates.benchmarkOptOut !== 'boolean') {
    return res.bad('benchmarkOptOut must be a boolean');
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
