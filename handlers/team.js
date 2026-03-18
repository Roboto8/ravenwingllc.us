const db = require('./lib/dynamo');
const auth = require('./lib/auth');
const res = require('./lib/response');
const crypto = require('crypto');
const { checkPermission } = require('./roles');

// List team members
module.exports.list = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const { items } = await db.query('COMPANY#' + companyId, 'USER#', 50);
  const invites = await db.query('COMPANY#' + companyId, 'INVITE#', 50);

  return res.ok({
    members: items.map(m => ({
      email: m.email,
      name: m.name,
      role: m.role,
      joinedAt: m.createdAt
    })),
    invites: invites.items
      .filter(i => i.status === 'pending')
      .map(i => ({
        email: i.email,
        token: i.token,
        invitedAt: i.createdAt
      }))
  });
};

// Invite a new member
module.exports.invite = async (event) => {
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

  await db.put({
    PK: 'COMPANY#' + companyId,
    SK: 'INVITE#' + token,
    GSI1PK: 'INVITE#' + token,
    GSI1SK: 'COMPANY#' + companyId,
    email,
    token,
    status: 'pending',
    createdAt: now
  });

  return res.created({ token, email });
};

// Revoke an invite
module.exports.revoke = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();
  if (!await checkPermission(event, companyId, 'team.invite')) return res.forbidden('No permission to manage invites');

  const token = event.pathParameters.token;
  await db.remove('COMPANY#' + companyId, 'INVITE#' + token);

  return res.ok({ revoked: true });
};

// Remove a team member
module.exports.remove = async (event) => {
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

  await db.remove(member.PK, member.SK);
  return res.ok({ removed: true });
};

// Validate an invite token (public — no auth required)
module.exports.validate = async (event) => {
  const token = event.pathParameters.token;

  const items = await db.queryGSI('INVITE#' + token);
  if (items.length === 0) return res.notFound('Invalid invite');

  const invite = items[0];
  if (invite.status !== 'pending') return res.bad('Invite already used');

  const companyId = invite.GSI1SK.replace('COMPANY#', '');
  const company = await db.get('COMPANY#' + companyId, 'PROFILE');

  return res.ok({
    valid: true,
    companyName: company ? company.name : 'Unknown',
    email: invite.email
  });
};
