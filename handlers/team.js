const db = require('./lib/dynamo');
const auth = require('./lib/auth');
const res = require('./lib/response');
const crypto = require('crypto');
const { checkPermission } = require('./roles');

// List team members
module.exports.list = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  // Only invite-managers see raw tokens; others see redacted invite list so a low-priv
  // member cannot lift a pending token and join as that identity.
  const canManageInvites = await checkPermission(event, companyId, 'team.invite');

  const { items } = await db.query('COMPANY#' + companyId, 'USER#', 50);
  const invites = await db.query('COMPANY#' + companyId, 'INVITE#', 50);

  const now = Date.now();
  const pendingInvites = invites.items.filter(i => {
    if (i.status !== 'pending') return false;
    if (i.expiresAt && i.expiresAt * 1000 < now) return false;
    return true;
  });

  return res.ok({
    members: items.map(m => ({
      email: m.email,
      name: m.name,
      role: m.role,
      joinedAt: m.createdAt
    })),
    invites: pendingInvites.map(i => {
      const base = { email: i.email, invitedAt: i.createdAt };
      if (i.expiresAt) base.expiresAt = new Date(i.expiresAt * 1000).toISOString();
      if (canManageInvites) base.token = i.token;
      return base;
    })
  });
});

// Invite a new member
module.exports.invite = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();
  if (!await checkPermission(event, companyId, 'team.invite')) return res.forbidden('No permission to invite members');

  const body = res.parseBody(event);
  if (!body) return res.bad('Invalid JSON');
  const email = (body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return res.bad('Valid email required');

  // Check if already a member
  const { items } = await db.query('COMPANY#' + companyId, 'USER#', 50);
  const existing = items.find(m => m.email === email);
  if (existing) return res.bad('Already a team member');

  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
  const expiresAt = Math.floor(Date.now() / 1000) + INVITE_TTL_SECONDS;

  await db.put({
    PK: 'COMPANY#' + companyId,
    SK: 'INVITE#' + token,
    GSI1PK: 'INVITE#' + token,
    GSI1SK: 'COMPANY#' + companyId,
    email,
    token,
    status: 'pending',
    createdAt: now,
    // DynamoDB TTL attribute (table already has TTL enabled on `expiresAt` per serverless.yml)
    expiresAt
  });

  return res.created({ token, email, expiresAt: new Date(expiresAt * 1000).toISOString() });
});

// Revoke an invite
module.exports.revoke = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();
  if (!await checkPermission(event, companyId, 'team.invite')) return res.forbidden('No permission to manage invites');

  const token = event.pathParameters.token;
  await db.remove('COMPANY#' + companyId, 'INVITE#' + token);

  return res.ok({ revoked: true });
});

// Remove a team member
module.exports.remove = res.wrap(async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();
  if (!await checkPermission(event, companyId, 'team.remove')) return res.forbidden('No permission to remove members');

  const memberEmail = decodeURIComponent(event.pathParameters.email);

  // Find the member
  const { items } = await db.query('COMPANY#' + companyId, 'USER#', 50);
  const member = items.find(m => m.email === memberEmail);
  if (!member) return res.notFound('Member not found');

  // Can't remove yourself
  const user = auth.getUser(event);
  if (member.GSI1PK === 'USER#' + user.sub) return res.bad("Can't remove yourself");

  // Can't remove the company owner — would orphan the company (no one left who can
  // grant billing.manage/company.edit and restore admin access).
  if (member.role === 'owner') return res.bad("Can't remove the company owner");

  await db.remove(member.PK, member.SK);
  return res.ok({ removed: true });
});

// Validate an invite token (public — no auth required)
module.exports.validate = res.wrap(async (event) => {
  const token = event.pathParameters.token;

  const items = await db.queryGSI('INVITE#' + token);
  if (items.length === 0) return res.notFound('Invalid invite');

  const invite = items[0];
  if (invite.status !== 'pending') return res.bad('Invite already used');
  if (invite.expiresAt && invite.expiresAt * 1000 < Date.now()) return res.bad('Invite has expired');

  const companyId = invite.GSI1SK.replace('COMPANY#', '');
  const company = await db.get('COMPANY#' + companyId, 'PROFILE');

  return res.ok({
    valid: true,
    companyName: company ? company.name : 'Unknown',
    email: invite.email
  });
});
