const db = require('./lib/dynamo');
const crypto = require('crypto');

// Normalize email to prevent trial abuse via +alias and dot tricks
// e.g. "User+test@Gmail.com" → "user@gmail.com"
function normalizeEmail(email) {
  const [local, domain] = email.toLowerCase().split('@');
  if (!domain) return email.toLowerCase();
  // Strip +suffix aliases (works for Gmail, Outlook, most providers)
  const base = local.split('+')[0];
  // Strip dots for Gmail (dots are ignored by Gmail)
  const gmailDomains = ['gmail.com', 'googlemail.com'];
  const cleaned = gmailDomains.includes(domain) ? base.replace(/\./g, '') : base;
  return cleaned + '@' + domain;
}

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

      // Reject expired invites (TTL cleanup is eventual; check here for correctness too).
      const nowSec = Math.floor(Date.now() / 1000);
      if (invite.expiresAt && invite.expiresAt < nowSec) {
        // Fall through to create-own-company path (safer than joining expired company).
      } else if (!invite.email || invite.email.toLowerCase() === email.toLowerCase()) {
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
  }

  // No invite — create new company
  const companyId = crypto.randomUUID();
  const normalized = normalizeEmail(email);

  // Create company on free tier (2 estimates/month + share bonus)
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
    subscriptionStatus: 'free',
    tier: 'free',
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

// Exported for testing
module.exports.normalizeEmail = normalizeEmail;
