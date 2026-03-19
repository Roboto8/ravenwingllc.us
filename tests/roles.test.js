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

describe('roles handler', () => {
  beforeEach(() => jest.clearAllMocks());

  // Helper: mock an owner user for permission checks
  function mockOwnerUser() {
    auth.getUser.mockReturnValue({ sub: 'owner-sub' });
    db.queryGSI.mockResolvedValue([{ role: 'owner', GSI1SK: 'COMPANY#comp-1' }]);
  }

  describe('list', () => {
    test('returns built-in and custom roles', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          { name: 'estimator', color: '#336699', permissions: ['estimates.create', 'estimates.view'] }
        ]
      });

      const result = await roles.list({});
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.roles.length).toBeGreaterThanOrEqual(3); // owner + member + estimator
      expect(body.roles.find(r => r.name === 'owner').builtIn).toBe(true);
      expect(body.roles.find(r => r.name === 'member').builtIn).toBe(true);
      expect(body.roles.find(r => r.name === 'estimator').builtIn).toBe(false);
      expect(body.allPermissions).toBeDefined();
      expect(body.allPermissions.length).toBeGreaterThan(0);
    });

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await roles.list({});
      expect(result.statusCode).toBe(403);
    });
  });

  describe('create', () => {
    test('creates a custom role', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.put.mockResolvedValue({});

      const result = await roles.create({
        body: JSON.stringify({
          name: 'estimator',
          color: '#336699',
          permissions: ['estimates.create', 'estimates.view']
        })
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(201);
      expect(body.name).toBe('estimator');
      expect(body.permissions).toEqual(['estimates.create', 'estimates.view']);
    });

    test('rejects built-in role names', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();

      const result = await roles.create({
        body: JSON.stringify({ name: 'owner', permissions: [] })
      });
      expect(result.statusCode).toBe(400);
    });

    test('rejects short names', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();

      const result = await roles.create({
        body: JSON.stringify({ name: 'x', permissions: [] })
      });
      expect(result.statusCode).toBe(400);
    });

    test('filters invalid permissions', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.put.mockResolvedValue({});

      const result = await roles.create({
        body: JSON.stringify({
          name: 'viewer',
          permissions: ['estimates.view', 'fake.permission', 'also.fake']
        })
      });
      const body = JSON.parse(result.body);

      expect(body.permissions).toEqual(['estimates.view']);
    });
  });

  describe('update', () => {
    test('updates role permissions', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.update.mockResolvedValue({});

      const result = await roles.update({
        pathParameters: { name: 'estimator' },
        body: JSON.stringify({ permissions: ['estimates.view'] })
      });

      expect(result.statusCode).toBe(200);
      expect(db.update).toHaveBeenCalled();
    });

    test('cannot edit owner role', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();

      const result = await roles.update({
        pathParameters: { name: 'owner' },
        body: JSON.stringify({ permissions: [] })
      });
      expect(result.statusCode).toBe(400);
    });
  });

  describe('remove', () => {
    test('deletes role and resets members to member', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.query.mockResolvedValue({
        items: [
          { PK: 'COMPANY#comp-1', SK: 'USER#u1', role: 'estimator' },
          { PK: 'COMPANY#comp-1', SK: 'USER#u2', role: 'member' }
        ]
      });
      db.update.mockResolvedValue({});
      db.remove.mockResolvedValue({});

      const result = await roles.remove({
        pathParameters: { name: 'estimator' }
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.deleted).toBe(true);
      // Only u1 should be updated (had the deleted role)
      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-1', 'USER#u1', { role: 'member' }
      );
      expect(db.remove).toHaveBeenCalledWith('COMPANY#comp-1', 'ROLE#estimator');
    });

    test('cannot delete built-in roles', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();

      const result1 = await roles.remove({ pathParameters: { name: 'owner' } });
      expect(result1.statusCode).toBe(400);

      const result2 = await roles.remove({ pathParameters: { name: 'member' } });
      expect(result2.statusCode).toBe(400);
    });
  });

  describe('assign', () => {
    test('assigns role to member', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.query.mockResolvedValue({
        items: [{ email: 'john@test.com', PK: 'COMPANY#comp-1', SK: 'USER#u1', role: 'member' }]
      });
      db.update.mockResolvedValue({});

      const result = await roles.assign({
        body: JSON.stringify({ email: 'john@test.com', role: 'estimator' })
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.role).toBe('estimator');
    });

    test('cannot assign owner role', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();

      const result = await roles.assign({
        body: JSON.stringify({ email: 'john@test.com', role: 'owner' })
      });
      expect(result.statusCode).toBe(400);
    });

    test('cannot change owner user role', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.query.mockResolvedValue({
        items: [{ email: 'boss@test.com', PK: 'COMPANY#comp-1', SK: 'USER#u1', role: 'owner' }]
      });

      const result = await roles.assign({
        body: JSON.stringify({ email: 'boss@test.com', role: 'member' })
      });
      expect(result.statusCode).toBe(400);
    });

    test('returns 404 for unknown member', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.query.mockResolvedValue({ items: [] });

      const result = await roles.assign({
        body: JSON.stringify({ email: 'nobody@test.com', role: 'estimator' })
      });
      expect(result.statusCode).toBe(404);
    });

    test('returns 400 when email or role missing', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();

      const result = await roles.assign({
        body: JSON.stringify({ email: 'john@test.com' })
      });
      expect(result.statusCode).toBe(400);
    });

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await roles.assign({
        body: JSON.stringify({ email: 'john@test.com', role: 'estimator' })
      });
      expect(result.statusCode).toBe(403);
    });
  });

  describe('update - member role', () => {
    test('updates member role permissions via company profile', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.update.mockResolvedValue({});

      const result = await roles.update({
        pathParameters: { name: 'member' },
        body: JSON.stringify({ permissions: ['estimates.view', 'estimates.create'] })
      });

      expect(result.statusCode).toBe(200);
      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-1', 'PROFILE',
        { defaultMemberPermissions: ['estimates.view', 'estimates.create'] }
      );
    });

    test('returns 400 when no valid fields to update', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();

      const result = await roles.update({
        pathParameters: { name: 'estimator' },
        body: JSON.stringify({})
      });
      expect(result.statusCode).toBe(400);
    });

    test('updates color on custom role', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      mockOwnerUser();
      db.update.mockResolvedValue({});

      const result = await roles.update({
        pathParameters: { name: 'estimator' },
        body: JSON.stringify({ color: '#ff0000' })
      });

      expect(result.statusCode).toBe(200);
      expect(db.update).toHaveBeenCalledWith(
        'COMPANY#comp-1', 'ROLE#estimator',
        expect.objectContaining({ color: '#ff0000' })
      );
    });

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await roles.update({
        pathParameters: { name: 'estimator' },
        body: JSON.stringify({ permissions: [] })
      });
      expect(result.statusCode).toBe(403);
    });
  });

  describe('checkPermission', () => {
    test('returns false when user is null', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      auth.getUser.mockReturnValue(null);

      // Try to create a role - should fail permission check
      const result = await roles.create({
        body: JSON.stringify({ name: 'test-role', permissions: ['estimates.view'] })
      });
      expect(result.statusCode).toBe(403);
    });

    test('returns false when user not found in GSI', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      auth.getUser.mockReturnValue({ sub: 'unknown-sub' });
      db.queryGSI.mockResolvedValue([]);

      const result = await roles.create({
        body: JSON.stringify({ name: 'test-role', permissions: ['estimates.view'] })
      });
      expect(result.statusCode).toBe(403);
    });

    test('member role permission check - denied for team.roles', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      auth.getUser.mockReturnValue({ sub: 'member-sub' });
      db.queryGSI.mockResolvedValue([{ role: 'member', GSI1SK: 'COMPANY#comp-1' }]);

      const result = await roles.create({
        body: JSON.stringify({ name: 'test-role', permissions: ['estimates.view'] })
      });
      expect(result.statusCode).toBe(403);
    });

    test('custom role permission check - with valid custom role', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      auth.getUser.mockReturnValue({ sub: 'custom-sub' });
      db.queryGSI.mockResolvedValue([{ role: 'admin', GSI1SK: 'COMPANY#comp-1' }]);
      db.get.mockResolvedValue({ permissions: ['team.roles', 'estimates.view'] });
      db.put.mockResolvedValue({});

      const result = await roles.create({
        body: JSON.stringify({ name: 'test-role', permissions: ['estimates.view'] })
      });
      expect(result.statusCode).toBe(201);
    });

    test('custom role permission check - role not found falls back to member', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      auth.getUser.mockReturnValue({ sub: 'custom-sub' });
      db.queryGSI.mockResolvedValue([{ role: 'deleted-role', GSI1SK: 'COMPANY#comp-1' }]);
      db.get.mockResolvedValue(undefined); // role not found

      const result = await roles.create({
        body: JSON.stringify({ name: 'test-role', permissions: ['estimates.view'] })
      });
      // Falls back to member permissions which don't include team.roles
      expect(result.statusCode).toBe(403);
    });
  });

  describe('list - edge cases', () => {
    test('skips items with owner or member name from DB', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [
          { name: 'owner', permissions: ['estimates.view'] },
          { name: 'member', permissions: ['estimates.view'] },
          { name: 'custom', permissions: ['estimates.view'] }
        ]
      });

      const result = await roles.list({});
      const body = JSON.parse(result.body);

      // Should have owner, member (built-in) + custom only
      expect(body.roles).toHaveLength(3);
    });

    test('custom role with no color gets default', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({
        items: [{ name: 'custom', permissions: ['estimates.view'] }]
      });

      const result = await roles.list({});
      const body = JSON.parse(result.body);

      const custom = body.roles.find(r => r.name === 'custom');
      expect(custom.color).toBe('#6b6052');
    });
  });

  describe('remove - edge cases', () => {
    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await roles.remove({ pathParameters: { name: 'estimator' } });
      expect(result.statusCode).toBe(403);
    });
  });
});
