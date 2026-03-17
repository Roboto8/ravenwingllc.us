const db = require('./lib/dynamo');
const auth = require('./lib/auth');
const res = require('./lib/response');

// All available permissions
const ALL_PERMISSIONS = [
  'estimates.create',
  'estimates.edit',
  'estimates.delete',
  'estimates.view',
  'team.invite',
  'team.remove',
  'team.roles',
  'billing.manage',
  'company.edit',
  'export.data'
];

// Built-in owner role — always has everything
const OWNER_ROLE = {
  name: 'owner',
  color: '#c0622e',
  permissions: ALL_PERMISSIONS,
  builtIn: true
};

// Default member role
const DEFAULT_MEMBER_ROLE = {
  name: 'member',
  color: '#6b6052',
  permissions: ['estimates.create', 'estimates.edit', 'estimates.view', 'export.data'],
  builtIn: true
};

// List all roles for the company
module.exports.list = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const { items } = await db.query('COMPANY#' + companyId, 'ROLE#', 50);

  // Always include built-in roles
  const roles = [OWNER_ROLE, DEFAULT_MEMBER_ROLE];
  items.forEach(r => {
    if (r.name !== 'owner' && r.name !== 'member') {
      roles.push({
        name: r.name,
        color: r.color || '#6b6052',
        permissions: r.permissions || [],
        builtIn: false
      });
    }
  });

  return res.ok({ roles, allPermissions: ALL_PERMISSIONS });
};

// Create a new role
module.exports.create = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  // Check if user has team.roles permission
  const hasPermission = await checkPermission(event, companyId, 'team.roles');
  if (!hasPermission) return res.forbidden('No permission to manage roles');

  const body = JSON.parse(event.body || '{}');
  const name = (body.name || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!name || name.length < 2) return res.bad('Role name required (2+ chars, alphanumeric)');
  if (name === 'owner' || name === 'member') return res.bad('Cannot create built-in role name');

  const permissions = (body.permissions || []).filter(p => ALL_PERMISSIONS.includes(p));
  const color = body.color || '#6b6052';

  await db.put({
    PK: 'COMPANY#' + companyId,
    SK: 'ROLE#' + name,
    name,
    color,
    permissions,
    createdAt: new Date().toISOString()
  });

  return res.created({ name, color, permissions, builtIn: false });
};

// Update a role
module.exports.update = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const hasPermission = await checkPermission(event, companyId, 'team.roles');
  if (!hasPermission) return res.forbidden('No permission to manage roles');

  const name = event.pathParameters.name;
  if (name === 'owner') return res.bad('Cannot edit owner role');

  const body = JSON.parse(event.body || '{}');
  const updates = {};

  if (body.permissions) {
    updates.permissions = body.permissions.filter(p => ALL_PERMISSIONS.includes(p));
  }
  if (body.color) updates.color = body.color;
  if (Object.keys(updates).length === 0) return res.bad('No valid fields');

  updates.updatedAt = new Date().toISOString();

  if (name === 'member') {
    // Update default member role in company profile
    await db.update('COMPANY#' + companyId, 'PROFILE', { defaultMemberPermissions: updates.permissions || [] });
  } else {
    await db.update('COMPANY#' + companyId, 'ROLE#' + name, updates);
  }

  return res.ok({ name, ...updates });
};

// Delete a role
module.exports.remove = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const hasPermission = await checkPermission(event, companyId, 'team.roles');
  if (!hasPermission) return res.forbidden('No permission to manage roles');

  const name = event.pathParameters.name;
  if (name === 'owner' || name === 'member') return res.bad('Cannot delete built-in roles');

  // Move anyone with this role back to 'member'
  const { items } = await db.query('COMPANY#' + companyId, 'USER#', 50);
  for (const user of items) {
    if (user.role === name) {
      await db.update(user.PK, user.SK, { role: 'member' });
    }
  }

  await db.remove('COMPANY#' + companyId, 'ROLE#' + name);
  return res.ok({ deleted: true });
};

// Assign a role to a member
module.exports.assign = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const hasPermission = await checkPermission(event, companyId, 'team.roles');
  if (!hasPermission) return res.forbidden('No permission to manage roles');

  const body = JSON.parse(event.body || '{}');
  const email = (body.email || '').trim().toLowerCase();
  const role = (body.role || '').trim().toLowerCase();

  if (!email || !role) return res.bad('Email and role required');
  if (role === 'owner') return res.bad('Cannot assign owner role');

  const { items } = await db.query('COMPANY#' + companyId, 'USER#', 50);
  const member = items.find(m => m.email === email);
  if (!member) return res.notFound('Member not found');
  if (member.role === 'owner') return res.bad('Cannot change owner role');

  await db.update(member.PK, member.SK, { role });
  return res.ok({ email, role });
};

// Check if the current user has a specific permission
async function checkPermission(event, companyId, permission) {
  const user = auth.getUser(event);
  if (!user) return false;

  const items = await db.queryGSI('USER#' + user.sub);
  if (items.length === 0) return false;

  const userRecord = items[0];
  const role = userRecord.role || 'member';

  // Owner always has all permissions
  if (role === 'owner') return true;

  // Check built-in member role
  if (role === 'member') {
    return DEFAULT_MEMBER_ROLE.permissions.includes(permission);
  }

  // Check custom role
  const roleRecord = await db.get('COMPANY#' + companyId, 'ROLE#' + role);
  if (!roleRecord) return DEFAULT_MEMBER_ROLE.permissions.includes(permission);

  return (roleRecord.permissions || []).includes(permission);
}

module.exports.checkPermission = checkPermission;
module.exports.ALL_PERMISSIONS = ALL_PERMISSIONS;
