const db = require('./lib/dynamo');
const auth = require('./lib/auth');
const res = require('./lib/response');
const { checkPermission } = require('./roles');
const getStripe = require('./lib/stripe');

// In-memory rate limit: companyId -> last checkout timestamp
const _checkoutTimestamps = {};
const RATE_LIMIT_MS = 10000; // 10 seconds

// Allowed return URL origins to prevent open redirects
const ALLOWED_ORIGINS = [
  'http://ravenwingllc-frontend-dev.s3-website-us-east-1.amazonaws.com',
  'http://ravenwing-frontend.s3-website-us-east-1.amazonaws.com',
  'https://fencetrace.com',
  'https://www.fencetrace.com'
];
const DEFAULT_RETURN = process.env.DEFAULT_RETURN_URL || 'http://ravenwingllc-frontend-dev.s3-website-us-east-1.amazonaws.com/';

function sanitizeReturnUrl(url) {
  if (!url || typeof url !== 'string') return DEFAULT_RETURN;
  try {
    const parsed = new URL(url);
    const isAllowed = ALLOWED_ORIGINS.some(function(origin) {
      return url.startsWith(origin);
    });
    return isAllowed ? url : DEFAULT_RETURN;
  } catch (e) {
    return DEFAULT_RETURN;
  }
}

module.exports.checkout = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();
  if (!await checkPermission(event, companyId, 'billing.manage')) return res.forbidden('No permission to manage billing');

  // Rate limit: prevent same company from spamming checkout
  const now = Date.now();
  if (_checkoutTimestamps[companyId] && (now - _checkoutTimestamps[companyId]) < RATE_LIMIT_MS) {
    return res.tooMany('Please wait before starting another checkout');
  }
  _checkoutTimestamps[companyId] = now;

  // Clean up stale rate limit entries to prevent memory leak in warm Lambda
  for (const key in _checkoutTimestamps) {
    if (now - _checkoutTimestamps[key] > RATE_LIMIT_MS * 6) {
      delete _checkoutTimestamps[key];
    }
  }

  const company = await db.get('COMPANY#' + companyId, 'PROFILE');
  if (!company) return res.notFound();

  // Prevent double-charge: block checkout if subscription is already active
  if (company.subscriptionStatus === 'active' && company.subscriptionId) {
    return res.bad('Company already has an active subscription');
  }

  const s = getStripe();
  const body = res.parseBody(event);
  if (!body) return res.bad('Invalid JSON');
  const returnUrl = sanitizeReturnUrl(body.returnUrl);

  // Determine price based on tier
  const tierPrices = {
    pro: process.env.STRIPE_PRICE_PRO || process.env.STRIPE_PRICE_CONTRACTOR,
    builder: process.env.STRIPE_PRICE_BUILDER,
    contractor: process.env.STRIPE_PRICE_CONTRACTOR
  };
  const tier = body.tier || 'pro';
  const priceId = tierPrices[tier] || process.env.STRIPE_PRICE_PRO || process.env.STRIPE_PRICE_CONTRACTOR || process.env.STRIPE_PRICE_ID;

  if (!priceId) return res.bad('No price configured for tier: ' + tier);

  // Create or reuse Stripe customer
  let customerId = company.stripeCustomerId;
  if (!customerId) {
    const customer = await s.customers.create({
      email: company.email,
      metadata: { companyId, tier }
    });
    customerId = customer.id;
    await db.update('COMPANY#' + companyId, 'PROFILE', {
      stripeCustomerId: customerId,
      GSI1PK: 'STRIPE#' + customerId,
      GSI1SK: 'PROFILE'
    });
  }

  const clientRefId = companyId + '_' + Date.now();

  const session = await s.checkout.sessions.create({
    customer: customerId,
    client_reference_id: clientRefId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: returnUrl + '?billing=success',
    cancel_url: returnUrl + '?billing=cancel',
    automatic_tax: { enabled: true },
    // Show clear pricing — no surprises
    consent_collection: { terms_of_service: 'required' },
    custom_text: {
      terms_of_service_acceptance: {
        message: 'You can cancel anytime from your account settings. No cancellation fees.'
      }
    }
  });

  return res.ok({ url: session.url });
});

module.exports.portal = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();
  if (!await checkPermission(event, companyId, 'billing.manage')) return res.forbidden('No permission to manage billing');

  const company = await db.get('COMPANY#' + companyId, 'PROFILE');
  if (!company || !company.stripeCustomerId) return res.bad('No billing account');

  const body = res.parseBody(event);
  if (!body) return res.bad('Invalid JSON');
  const returnUrl = sanitizeReturnUrl(body.returnUrl);

  const s = getStripe();
  const session = await s.billingPortal.sessions.create({
    customer: company.stripeCustomerId,
    return_url: returnUrl
  });

  return res.ok({ url: session.url });
});

module.exports.status = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const company = await db.get('COMPANY#' + companyId, 'PROFILE');
  if (!company) return res.notFound();

  const trialActive = company.subscriptionStatus === 'trialing' && new Date(company.trialEndsAt) > new Date();
  const daysLeft = trialActive ? Math.ceil((new Date(company.trialEndsAt) - new Date()) / (1000 * 60 * 60 * 24)) : 0;
  const isPaidStatus = company.subscriptionStatus === 'active' || company.subscriptionStatus === 'past_due';
  const isFree = !isPaidStatus;

  // Get next billing date from Stripe if subscribed
  let nextBillingDate = null;
  let planAmount = null;
  // Default tier: use stored tier, but fall back to 'free' for non-paid users
  let tier = isPaidStatus ? (company.tier || 'pro') : 'free';
  if (company.subscriptionId && company.subscriptionStatus === 'active') {
    try {
      const s = getStripe();
      const sub = await s.subscriptions.retrieve(company.subscriptionId);
      nextBillingDate = new Date(sub.current_period_end * 1000).toISOString();
      planAmount = sub.items.data[0].price.unit_amount / 100;
      // Detect tier from price — legacy builder/contractor map to pro
      const priceId = sub.items.data[0].price.id;
      if (priceId === process.env.STRIPE_PRICE_PRO) tier = 'pro';
      else if (priceId === process.env.STRIPE_PRICE_BUILDER) tier = 'pro';
      else tier = 'pro';
    } catch (e) {
      console.warn('Stripe subscription lookup failed:', e.message);
    }
  }

  // Count estimates this month for non-paid users (free, expired trial, canceled)
  let estimatesUsed = 0;
  let estimateLimit = null;
  if (isFree) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { items } = await db.query('COMPANY#' + companyId, 'EST#', 50);
    estimatesUsed = items.filter(i => i.status !== 'deleted' && i.createdAt >= monthStart).length;
    // Base limit 2 + share bonus
    const nowMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    estimateLimit = 2 + (company.shareBonusMonth === nowMonth ? 1 : 0);
  }

  // past_due gets a 7-day grace period before lockout
  const isPastDue = company.subscriptionStatus === 'past_due';
  // All users can create (subject to limits) — active flag controls UI, not hard lockout
  const isActive = true;

  return res.ok({
    status: company.subscriptionStatus,
    trialEndsAt: company.trialEndsAt,
    trialActive,
    daysLeft,
    active: isActive,
    pastDue: isPastDue,
    nextBillingDate,
    planAmount,
    tier,
    estimatesUsed,
    estimateLimit,
    canCancel: company.subscriptionStatus === 'active' || isPastDue
  });
});

// Share bonus — grant +1 estimate for sharing this month
module.exports.shareBonus = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const company = await db.get('COMPANY#' + companyId, 'PROFILE');
  if (!company) return res.notFound();

  const now = new Date();
  const nowMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  // Already claimed this month
  if (company.shareBonusMonth === nowMonth) {
    return res.ok({ granted: false, message: 'Share bonus already claimed this month' });
  }

  await db.update('COMPANY#' + companyId, 'PROFILE', { shareBonusMonth: nowMonth });
  return res.ok({ granted: true, message: 'Bonus estimate unlocked! You now have 3 estimates this month.' });
});

// Data export — let users download all their estimates
module.exports.exportData = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();
  if (!await checkPermission(event, companyId, 'export.data')) return res.forbidden('No permission to export data');

  const company = await db.get('COMPANY#' + companyId, 'PROFILE');
  if (!company) return res.notFound();

  // Get all estimates
  const allEstimates = [];
  let lastKey = null;
  do {
    const result = await db.query('COMPANY#' + companyId, 'EST#', 100, lastKey);
    result.items.forEach(function(item) {
      const { PK, SK, GSI1PK, GSI1SK, ...rest } = item;
      allEstimates.push(rest);
    });
    lastKey = result.nextKey;
  } while (lastKey);

  return res.ok({
    company: {
      name: company.name,
      email: company.email,
      phone: company.phone,
      address: company.address
    },
    estimates: allEstimates,
    exportDate: new Date().toISOString(),
    totalEstimates: allEstimates.length
  });
});

// Exposed for testing
module.exports._checkoutTimestamps = _checkoutTimestamps;
