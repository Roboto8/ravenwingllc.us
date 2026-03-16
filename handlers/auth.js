const db = require('./lib/dynamo');
const crypto = require('crypto');

module.exports.postConfirmation = async (event) => {
  const { sub, email } = event.request.userAttributes;
  const companyName = event.request.userAttributes['custom:companyName'] || 'My Company';
  const companyId = crypto.randomUUID();
  const now = new Date().toISOString();
  const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  // Create company
  await db.put({
    PK: 'COMPANY#' + companyId,
    SK: 'PROFILE',
    name: companyName,
    email,
    phone: '',
    accentColor: '',
    tagline: '',
    address: '',
    logoKey: '',
    stripeCustomerId: '',
    subscriptionId: '',
    subscriptionStatus: 'trialing',
    trialEndsAt: trialEnds,
    createdAt: now
  });

  // Create user
  await db.put({
    PK: 'COMPANY#' + companyId,
    SK: 'USER#' + sub,
    GSI1PK: 'USER#' + sub,
    GSI1SK: 'COMPANY#' + companyId,
    email,
    name: '',
    role: 'owner',
    createdAt: now
  });

  return event;
};
