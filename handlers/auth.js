const db = require('./lib/dynamo');
const crypto = require('crypto');

module.exports.postConfirmation = async (event) => {
  const { sub, email } = event.request.userAttributes;
  const companyName = event.request.userAttributes['custom:companyName'] || 'My Company';
  const inviteToken = event.request.userAttributes['custom:inviteToken'] || '';
  const now = new Date().toISOString();

  // Check if joining via invite
  if (inviteToken) {
    const items = await db.queryGSI('INVITE#' + inviteToken);
    if (items.length > 0 && items[0].status === 'pending') {
      const invite = items[0];
      const companyId = invite.GSI1SK.replace('COMPANY#', '');

      // Create user under existing company
      await db.put({
        PK: 'COMPANY#' + companyId,
        SK: 'USER#' + sub,
        GSI1PK: 'USER#' + sub,
        GSI1SK: 'COMPANY#' + companyId,
        email,
        name: '',
        role: 'member',
        createdAt: now
      });

      // Mark invite as used
      await db.update(invite.PK, invite.SK, {
        status: 'accepted',
        acceptedBy: sub,
        acceptedAt: now
      });

      return event;
    }
  }

  // No invite — create new company
  const companyId = crypto.randomUUID();
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

  // Create user as owner
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
