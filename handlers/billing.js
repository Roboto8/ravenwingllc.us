const db = require('./lib/dynamo');
const auth = require('./lib/auth');
const res = require('./lib/response');

let stripe;
function getStripe() {
  if (!stripe) stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

// Allowed return URL origins to prevent open redirects
const ALLOWED_ORIGINS = [
  'http://ravenwingllc-frontend-dev.s3-website-us-east-1.amazonaws.com',
  'http://ravenwing-frontend.s3-website-us-east-1.amazonaws.com',
  'https://' // any CloudFront or custom domain with HTTPS
];
const DEFAULT_RETURN = 'http://ravenwingllc-frontend-dev.s3-website-us-east-1.amazonaws.com/';

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

module.exports.checkout = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const company = await db.get('COMPANY#' + companyId, 'PROFILE');
  if (!company) return res.notFound();

  const s = getStripe();
  const body = JSON.parse(event.body || '{}');
  const returnUrl = sanitizeReturnUrl(body.returnUrl);

  // Create or reuse Stripe customer
  let customerId = company.stripeCustomerId;
  if (!customerId) {
    const customer = await s.customers.create({
      email: company.email,
      metadata: { companyId }
    });
    customerId = customer.id;
    await db.update('COMPANY#' + companyId, 'PROFILE', { stripeCustomerId: customerId });
  }

  const session = await s.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: returnUrl + '?billing=success',
    cancel_url: returnUrl + '?billing=cancel',
    // Show clear pricing — no surprises
    consent_collection: { terms_of_service: 'required' },
    custom_text: {
      terms_of_service_acceptance: {
        message: 'You can cancel anytime from your account settings. No cancellation fees.'
      }
    }
  });

  return res.ok({ url: session.url });
};

module.exports.portal = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const company = await db.get('COMPANY#' + companyId, 'PROFILE');
  if (!company || !company.stripeCustomerId) return res.bad('No billing account');

  const body = JSON.parse(event.body || '{}');
  const returnUrl = sanitizeReturnUrl(body.returnUrl);

  const s = getStripe();
  const session = await s.billingPortal.sessions.create({
    customer: company.stripeCustomerId,
    return_url: returnUrl
  });

  return res.ok({ url: session.url });
};

module.exports.status = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const company = await db.get('COMPANY#' + companyId, 'PROFILE');
  if (!company) return res.notFound();

  const trialActive = company.subscriptionStatus === 'trialing' && new Date(company.trialEndsAt) > new Date();
  const daysLeft = trialActive ? Math.ceil((new Date(company.trialEndsAt) - new Date()) / (1000 * 60 * 60 * 24)) : 0;

  // Get next billing date from Stripe if subscribed
  let nextBillingDate = null;
  let planAmount = null;
  if (company.subscriptionId && company.subscriptionStatus === 'active') {
    try {
      const s = getStripe();
      const sub = await s.subscriptions.retrieve(company.subscriptionId);
      nextBillingDate = new Date(sub.current_period_end * 1000).toISOString();
      planAmount = sub.items.data[0].price.unit_amount / 100;
    } catch (e) {
      // Stripe call failed, continue without billing info
    }
  }

  return res.ok({
    status: company.subscriptionStatus,
    trialEndsAt: company.trialEndsAt,
    trialActive,
    daysLeft,
    active: company.subscriptionStatus === 'active' || trialActive,
    nextBillingDate,
    planAmount,
    canCancel: company.subscriptionStatus === 'active'
  });
};

// Data export — let users download all their estimates
module.exports.exportData = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

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
};
