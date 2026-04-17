/**
 * Tests targeting uncovered branches in roles.js
 * Covers: permission deny paths, edge cases in list/create/update/assign/remove
 */
jest.mock('../handlers/lib/dynamo', () => ({
  get: jest.fn(),
  put: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  query: jest.fn(),
  findById: jest.fn(),
  queryGSI: jest.fn()
}));

jest.mock('../handlers/lib/auth', () => ({
  getUser: jest.fn(),
  getCompanyId: jest.fn()
}));

const db = require('../handlers/lib/dynamo');
const auth = require('../handlers/lib/auth');
const roles = require('../handlers/roles');

describe('roles handler - branch coverage', () => {
  beforeEach(() => jest.clearAllMocks());

  function mockOwnerUser() {
    auth.getUser.mockReturnValue({ sub: 'owner-sub' });
    db.queryGSI.mockResolvedValue([{ role: 'owner', GSI1SK: 'COMPANY#comp-1' }]);
  }

  // ===== checkPermission branches =====
  describe('checkPermission - role fallback', () => {
    test('user with no role field defaults to member', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      auth.getUser.mockReturnValue({ sub: 'user-sub' });
      // GSI returns record without role field
      db.queryGSI.mockResolvedValue([{ GSI1SK: 'COMPANY#comp-1' }]);

      // member role has estimates.create permission
      const result = await roles.create({
        body: JSON.stringify({ name: 'newrole', permissions: [] })
      });
      // member doesn't have team.roles, so should be denied
      expect(result.statusCode).toBe(403);
    });

    test('member can access estimates.view (default permission)', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      auth.getUser.mockReturnValue({ sub: 'member-sub' });
      db.queryGSI.mockResolvedValue([{ role: 'member', GSI1SK: 'COMPANY#comp-1' }]);

      // checkPermission is called internally; member has estimates.view but not team.roles
      const hasPerm = await roles.checkPermission({}, 'comp-1', 'estimates.view');
      expect(hasPerm).toBe(true);
    });

    test('member cannot access billing.manage', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      auth.getUser.mockReturnValue({ sub: 'member-sub' });
      db.queryGSI.mockResolvedValue([{ role: 'member', GSI1SK: 'COMPANY#comp-1' }]);

      const hasPerm = await roles.checkPermission({}, 'comp-1', 'billing.manage');
      expect(hasPerm).toBe(false);
    });

    test('custom role with empty permissions array denies all', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      auth.getUser.mockReturnValue({ sub: 'custom-sub' });
      db.queryGSI.mockResolvedValue([{ role: 'viewer', GSI1SK: 'COMPANY#comp-1' }]);
      db.get.mockResolvedValue({ permissions: [] });

      const hasPerm = await roles.checkPermission({}, 'comp-1', 'estimates.view');
      expect(hasPerm).toBe(false);
    });

    test('custom role without permissions field defaults to empty', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      auth.getUser.mockReturnValue({ sub: 'custom-sub' });
      db.queryGSI.mockResolvedValue([{ role: 'norole', GSI1SK: 'COMPANY#comp-1' }]);
      db.get.mockResolvedValue({}); // no permissions field

      const hasPerm = await roles.checkPermission({}, 'comp-1', 'estimates.view');
      expect(hasPerm).toBe(false);
    });
  });

  // ===== list branches =====
  describe('list - item permissions default', () => {
    test('custom role with no permissions field gets empty array', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [{ name: 'norole' }] // no permissions or color
      });

      const result = await roles.list({});
      const body = JSON.parse(result.body);

      const custom = body.roles.find(r => r.name === 'norole');
      expect(custom.permissions).toEqual([]);
      expect(custom.color).toBe('#6b6052');
      expect(custom.builtIn).toBe(false);
    });
  });

  // ===== create branches =====
  describe('create - missing body fields', () => {
    test('handles missing name field', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();

      const result = await roles.create({
        body: JSON.stringify({ permissions: ['estimates.view'] })
      });
      expect(result.statusCode).toBe(400);
    });

    test('handles empty permissions array', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.put.mockResolvedValue({});

      const result = await roles.create({
        body: JSON.stringify({ name: 'emptyrole', permissions: [] })
      });
      const body = JSON.parse(result.body);
      expect(result.statusCode).toBe(201);
      expect(body.permissions).toEqual([]);
    });

    test('handles missing permissions field', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.put.mockResolvedValue({});

      const result = await roles.create({
        body: JSON.stringify({ name: 'norole' })
      });
      const body = JSON.parse(result.body);
      expect(result.statusCode).toBe(201);
      expect(body.permissions).toEqual([]);
    });
  });

  // ===== update branches =====
  describe('update - member role color', () => {
    test('member role update with only color still updates profile', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.update.mockResolvedValue({});

      const result = await roles.update({
        pathParameters: { name: 'member' },
        body: JSON.stringify({ permissions: ['estimates.view'] })
      });

      expect(result.statusCode).toBe(200);
      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-1', 'PROFILE',
        { defaultMemberPermissions: ['estimates.view'] }
      );
    });

    test('update with only permissions and no color', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.update.mockResolvedValue({});

      const result = await roles.update({
        pathParameters: { name: 'estimator' },
        body: JSON.stringify({ permissions: ['estimates.view', 'estimates.create'] })
      });

      expect(result.statusCode).toBe(200);
      const updateCall = db.update.mock.calls[0][2];
      expect(updateCall.permissions).toEqual(['estimates.view', 'estimates.create']);
      expect(updateCall.color).toBeUndefined();
    });

    test('update with null body returns 400', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();

      const result = await roles.update({
        pathParameters: { name: 'estimator' },
        body: null
      });
      expect(result.statusCode).toBe(400);
    });
  });

  // ===== assign branches =====
  describe('assign - permission denied', () => {
    test('non-owner without team.roles cannot assign roles', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      auth.getUser.mockReturnValue({ sub: 'member-sub' });
      db.queryGSI.mockResolvedValue([{ role: 'member', GSI1SK: 'COMPANY#comp-1' }]);

      const result = await roles.assign({
        body: JSON.stringify({ email: 'john@test.com', role: 'estimator' })
      });
      expect(result.statusCode).toBe(403);
    });
  });

  // ===== remove branches =====
  describe('remove - permission denied', () => {
    test('non-owner without team.roles cannot delete roles', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      auth.getUser.mockReturnValue({ sub: 'member-sub' });
      db.queryGSI.mockResolvedValue([{ role: 'member', GSI1SK: 'COMPANY#comp-1' }]);

      const result = await roles.remove({
        pathParameters: { name: 'estimator' }
      });
      expect(result.statusCode).toBe(403);
    });
  });
});
