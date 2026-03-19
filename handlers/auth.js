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

      // Verify the signup email matches the invited email — if not, fall through to create own company
      if (!invite.email || invite.email.toLowerCase() === email.toLowerCase()) {
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

  // Check if this email (normalized) has already used a trial
  const existingTrial = await db.get('TRIAL', normalized);
  const trialUsed = !!existingTrial;

  const trialEnds = trialUsed
    ? new Date(0).toISOString()  // Expired immediately — no second trial
    : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

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
    subscriptionStatus: trialUsed ? 'expired' : 'trialing',
    trialEndsAt: trialEnds,
    createdAt: now
  });

  // Record trial usage (persists forever — one trial per normalized email)
  if (!trialUsed) {
    await db.put({
      PK: 'TRIAL',
      SK: normalized,
      email,
      companyId,
      createdAt: now
    });
  }

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
