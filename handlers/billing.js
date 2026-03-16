const db = require('./lib/dynamo');
const auth = require('./lib/auth');
const res = require('./lib/response');

let stripe;
function getStripe() {
  if (!stripe) stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

module.exports.checkout = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const company = await db.get('COMPANY#' + companyId, 'PROFILE');
  if (!company) return res.notFound();

  const s = getStripe();
  const body = JSON.parse(event.body || '{}');
  const returnUrl = body.returnUrl || 'https://ravenwingllc-frontend-dev.s3-website-us-east-1.amazonaws.com/';

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
    cancel_url: returnUrl + '?billing=cancel'
  });

  return res.ok({ url: session.url });
};

module.exports.portal = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const company = await db.get('COMPANY#' + companyId, 'PROFILE');
  if (!company || !company.stripeCustomerId) return res.bad('No billing account');

  const body = JSON.parse(event.body || '{}');
  const returnUrl = body.returnUrl || 'https://ravenwingllc-frontend-dev.s3-website-us-east-1.amazonaws.com/';

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

  return res.ok({
    status: company.subscriptionStatus,
    trialEndsAt: company.trialEndsAt,
    trialActive,
    daysLeft,
    active: company.subscriptionStatus === 'active' || trialActive
  });
};
